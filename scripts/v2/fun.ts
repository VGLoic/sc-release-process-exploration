import { createReadStream } from "fs";
import { readFile } from "fs/promises";

/**
 * JSON parser
 * Goals:
 * 1. reach as fast as possible the values within `output.contracts`
 * 2. for each key within `output.contracts`, obtain the value that is an object and emit the key value,
 * 3. once we have left `output.contracts`, return
 *
 * ## About step 1:
 * We need to only keep track of the levels of nesting
 * Once we have reach `output.contracts`, we are good,
 * Optimization: only register level of interest, i.e. `output` and then `output.contracts`
 *
 * ## About step 2:
 * Once we find a key:
 *  - once we enter in the value object, start registering the whole object as string,
 *  - stop registering when we exit the object, emit the key/value and restart
 *
 * ## About step 3:
 * We return
 */

/**
 * Current level `object`:
 * - we expect a string,
 * - we expect `:`,
 * - enter value,
 * - we expect `,`
 * - repeat
 *
 * In value:
 * - we can have a number,
 * - we can have a string,
 * - we can have a boolean,
 * - we can have null,
 * - we can have an object,
 * - we can have an array
 */

type ArrayState = {
  type: "array";
} & ( // Can transit to `dealing-with-number-or-expecting-comma` or `dealing-with-string` or going out of the level
  | {
      status: "identifying-value-type";
      index: number | null;
    }
  // Can transit to `identifying-value-type` or going out of the level
  | {
      status: "dealing-with-number-or-expecting-comma";
      index: number;
    }
  // Can transit to `identifying-value-type` or going out of the level
  | {
      status: "dealing-with-boolean-or-expecting-comma";
      index: number;
    }
  // Can transit to `identifying-value-type` or going out of the level
  | {
      status: "dealing-with-null-or-expecting-comma";
      index: number;
    }
  // Can transit to `expecting-end-of-item`
  | {
      status: "dealing-with-string";
      isNextCharEscaped: boolean;
      index: number;
    }
  // Can transit to `identifying-value-type` or going out of level
  | {
      status: "expecting-end-of-item";
      index: number;
    }
);

type ObjectState = {
  type: "object";
} & ( // Expecting a ditto mark `"` or `}` // Can transit to `building-key` or going out of the level
  | {
      status: "expecting-key-or-end-of-object";
    }
  // Can transit to `expecting-transition-to-value`
  | {
      status: "building-key";
      key: string;
      isNextCharEscaped: boolean;
    }
  // Can transit to `identifying-value-type`
  // Expecing a colon `:`
  | {
      status: "expecting-transition-to-value";
      key: string;
    }
  // Can transit to `dealing-with-number-or-expecting-comma` or `dealing-with-string` or `expecting-key-or-end-of-object`
  // Expecting either a number, either a ditto mark `"`, either an object bracket `{`, either an array bracket `[`
  | {
      status: "identifying-value-type";
      key: string;
    }
  // Can transit to `expecting-key-or-end-of-object` or going out of the level
  // Expecting either a number, either a comma `,`, either `}`
  | {
      status: "dealing-with-number-or-expecting-end-of-value";
      key: string;
    }
  // Can transit to `expecting-key-or-end-of-object` or going out of the level
  // Expecting either a part of boolean string, either a comma `,`, either `}`
  | {
      status: "dealing-with-boolean-or-expecting-end-of-value";
      key: string;
    }
  // Can transit to `expecting-key-or-end-of-object` or going out of the level
  // Expecting either a part of `null` string, either a comma `,`, either `}`
  | {
      status: "dealing-with-null-or-expecting-end-of-value";
      key: string;
    }
  // Can transit to `expecting-end-of-value`
  // Expecting either a string, either a ditto mark `"`
  | {
      status: "dealing-with-string";
      key: string;
      isNextCharEscaped: boolean;
    }
  // Can transit to `expecting-key-or-end-of-object` or going out of the level
  // Expecting a comma `,` or `}`
  | {
      status: "expecting-end-of-value";
      key: string;
    }
);

type ParentLevel =
  | {
      type: "object";
      key: string;
    }
  | {
      type: "array";
      index: number;
    };

type State = {
  levels: ParentLevel[];
  currentLevel: ObjectState | ArrayState | undefined;
  recordingKey: string | undefined;
  contracts: Record<string, any>;
};

class MoreInvolvedTracker {
  public state: State = {
    levels: [],
    currentLevel: undefined,
    recordingKey: undefined,
    contracts: {},
  };

  onChar(char: number | string) {
    const state = this.state.currentLevel;
    if (!state) {
      if (char === "{") {
        this.state.currentLevel = {
          type: "object",
          status: "expecting-key-or-end-of-object",
        };
      } else if (char === " " || char === "\n") {
        return;
      } else {
        throw new Error(`Unhandled character at root: "${char}"`);
      }
      return;
    }
    if (this.state.recordingKey) {
      this.state.contracts[this.state.recordingKey] += char;
    }
    if (state.type === "object") {
      this.onCharWithObjectState(state, char);
    } else {
      this.onCharWithArrayState(state, char);
    }
  }

  onCharWithArrayState(state: ArrayState, char: number | string) {
    if (state.status === "identifying-value-type") {
      switch (char) {
        case "\n":
        case " ":
          break;
        case '"':
          this.state.currentLevel = {
            type: "array",
            index: state.index === null ? 0 : state.index,
            status: "dealing-with-string",
            isNextCharEscaped: false,
          };
          break;
        case "{":
          this.state.currentLevel = {
            type: "object",
            status: "expecting-key-or-end-of-object",
          };
          this.state.levels.push({
            type: "array",
            index: state.index === null ? 0 : state.index,
          });
          break;
        case "[":
          this.state.currentLevel = {
            type: "array",
            index: null,
            status: "identifying-value-type",
          };
          this.state.levels.push({
            type: "array",
            index: state.index === null ? 0 : state.index,
          });
          break;
        case "]":
          const parentLevel = this.state.levels.pop();
          if (parentLevel) {
            if (parentLevel.type === "object") {
              this.state.currentLevel = {
                type: "object",
                status: "expecting-end-of-value",
                key: parentLevel.key,
              };
            } else {
              this.state.currentLevel = {
                type: "array",
                index: parentLevel.index,
                status: "expecting-end-of-item",
              };
            }
          }
          break;
        case "t":
        case "f":
          this.state.currentLevel = {
            type: "array",
            status: "dealing-with-boolean-or-expecting-comma",
            index: state.index === null ? 0 : state.index,
          };
          break;
        case "n":
          this.state.currentLevel = {
            type: "array",
            status: "dealing-with-null-or-expecting-comma",
            index: state.index === null ? 0 : state.index,
          };
          break;
        case "-":
          this.state.currentLevel = {
            type: "array",
            status: "dealing-with-number-or-expecting-comma",
            index: state.index === null ? 0 : state.index,
          };
          break;
        default:
          if (!isNaN(Number(char))) {
            this.state.currentLevel = {
              type: "array",
              status: "dealing-with-number-or-expecting-comma",
              index: state.index === null ? 0 : state.index,
            };
            return;
          }
          throw new Error(
            `Char "${char}" not handled in state ${JSON.stringify(
              this.state,
              null,
              2,
            )}`,
          );
      }
      return;
    }

    if (state.status === "dealing-with-number-or-expecting-comma") {
      if (char === ",") {
        this.state.currentLevel = {
          type: "array",
          index: state.index + 1,
          status: "identifying-value-type",
        };
      } else if (char === "]") {
        const parentLevel = this.state.levels.pop();
        if (parentLevel) {
          if (parentLevel.type === "object") {
            this.state.currentLevel = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            this.state.currentLevel = {
              type: "array",
              index: parentLevel.index,
              status: "expecting-end-of-item",
            };
          }
        }
        // } else if (char === "\n" || char === " ") {
        //   return;
      }
      return;
    }

    if (state.status === "dealing-with-boolean-or-expecting-comma") {
      if (char === ",") {
        this.state.currentLevel = {
          type: "array",
          index: state.index + 1,
          status: "identifying-value-type",
        };
      } else if (char === "]") {
        const parentLevel = this.state.levels.pop();
        if (parentLevel) {
          if (parentLevel.type === "object") {
            this.state.currentLevel = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            this.state.currentLevel = {
              type: "array",
              index: parentLevel.index,
              status: "expecting-end-of-item",
            };
          }
        }
        // } else if (char === "\n" || char === " ") {
        //   return;
      }
      return;
    }

    if (state.status === "dealing-with-null-or-expecting-comma") {
      if (char === ",") {
        this.state.currentLevel = {
          type: "array",
          index: state.index + 1,
          status: "identifying-value-type",
        };
      } else if (char === "]") {
        const parentLevel = this.state.levels.pop();
        if (parentLevel) {
          if (parentLevel.type === "object") {
            this.state.currentLevel = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            this.state.currentLevel = {
              type: "array",
              index: parentLevel.index,
              status: "expecting-end-of-item",
            };
          }
        }
        // } else if (char === "\n" || char === " ") {
        //   return;
      }
      return;
    }

    if (state.status === "dealing-with-string") {
      if (char === "\\") {
        state.isNextCharEscaped = true;
        this.state.currentLevel = state;
        return;
      }
      if (char === '"') {
        if (!state.isNextCharEscaped) {
          this.state.currentLevel = {
            type: "array",
            index: state.index,
            status: "expecting-end-of-item",
          };
          return;
        }
      }
      state.isNextCharEscaped = false;
      this.state.currentLevel = state;
      return;
    }

    if (state.status === "expecting-end-of-item") {
      if (char === ",") {
        this.state.currentLevel = {
          type: "array",
          index: state.index + 1,
          status: "identifying-value-type",
        };
      } else if (char === "]") {
        const parentLevel = this.state.levels.pop();
        if (parentLevel) {
          if (parentLevel.type === "object") {
            this.state.currentLevel = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            this.state.currentLevel = {
              type: "array",
              index: parentLevel.index,
              status: "expecting-end-of-item",
            };
          }
        }
      } else if (char === "\n" || char === " ") {
        return;
      } else {
        throw new Error(
          `Expecting a "," or "]" for ending the value, got "${char}"`,
        );
      }
      return;
    }

    throw new Error(`Unknown status ${state satisfies never}`);
  }

  onCharWithObjectState(state: ObjectState, char: number | string) {
    if (state.status === "identifying-value-type") {
      switch (char) {
        case "\n":
        case " ":
          break;
        case '"':
          this.state.currentLevel = {
            type: "object",
            status: "dealing-with-string",
            key: state.key,
            isNextCharEscaped: false,
          };
          break;
        case "{":
          if (!this.state.recordingKey) {
            const path = this.state.levels
              .map((l) => (l.type === "array" ? l.index : l.key))
              .join("@CUSTOM@");
            if (path === "output@CUSTOM@contracts") {
              this.state.recordingKey = state.key;
              this.state.contracts[state.key] = "{";
            }
          }
          this.state.currentLevel = {
            type: "object",
            status: "expecting-key-or-end-of-object",
          };
          this.state.levels.push({
            type: "object",
            key: state.key,
          });
          break;
        case "[":
          this.state.currentLevel = {
            type: "array",
            index: null,
            status: "identifying-value-type",
          };
          this.state.levels.push({
            type: "object",
            key: state.key,
          });
          break;
        case "t":
        case "f":
          this.state.currentLevel = {
            type: "object",
            status: "dealing-with-boolean-or-expecting-end-of-value",
            key: state.key,
          };
          break;
        case "n":
          this.state.currentLevel = {
            type: "object",
            status: "dealing-with-null-or-expecting-end-of-value",
            key: state.key,
          };
          break;
        case "-":
          this.state.currentLevel = {
            type: "object",
            status: "dealing-with-number-or-expecting-end-of-value",
            key: state.key,
          };
          break;
        default:
          if (!isNaN(Number(char))) {
            this.state.currentLevel = {
              type: "object",
              status: "dealing-with-number-or-expecting-end-of-value",
              key: state.key,
            };
            return;
          }
          throw new Error(
            `Char "${char}" not handled in state ${JSON.stringify(
              this.state,
              null,
              2,
            )}`,
          );
      }
      return;
    }

    if (state.status === "expecting-key-or-end-of-object") {
      if (char === '"') {
        this.state.currentLevel = {
          type: "object",
          status: "building-key",
          key: "",
          isNextCharEscaped: false,
        };
      } else if (char === "}") {
        const parentLevel = this.state.levels.pop();
        if (parentLevel) {
          if (parentLevel.type === "object") {
            this.state.currentLevel = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            this.state.currentLevel = {
              type: "array",
              status: "expecting-end-of-item",
              index: parentLevel.index,
            };
          }
        }
        if (this.state.recordingKey) {
          const path = this.state.levels
            .map((l) => (l.type === "array" ? l.index : l.key))
            .join("@CUSTOM@");
          if (path === "output@CUSTOM@contracts") {
            this.state.recordingKey = undefined;
          }
        }
      } else if (char === "\n" || char === " ") {
        return;
      } else {
        throw new Error(`Expecting a "\"" for a key, got "${char}"`);
      }
      return;
    }

    if (state.status === "building-key") {
      if (char === "\\") {
        state.isNextCharEscaped = true;
        state.key += char;
        return;
      }

      if (char === '"') {
        if (!state.isNextCharEscaped) {
          this.state.currentLevel = {
            type: "object",
            status: "expecting-transition-to-value",
            key: state.key,
          };
          return;
        }
      }

      state.isNextCharEscaped = false;
      state.key += char;
      this.state.currentLevel = state;
      return;
    }

    if (state.status === "expecting-transition-to-value") {
      if (char === ":") {
        this.state.currentLevel = {
          type: "object",
          key: state.key,
          status: "identifying-value-type",
        };
      } else {
        throw new Error(
          `Expecing a ":" for transitionning to a value, got "${char}"`,
        );
      }
      return;
    }

    if (state.status === "dealing-with-string") {
      if (char === "\\") {
        state.isNextCharEscaped = true;
        this.state.currentLevel = state;
        return;
      }
      if (char === '"') {
        if (!state.isNextCharEscaped) {
          this.state.currentLevel = {
            type: "object",
            status: "expecting-end-of-value",
            key: state.key,
          };
          return;
        }
      }
      state.isNextCharEscaped = false;
      this.state.currentLevel = state;
      return;
    }

    if (state.status === "dealing-with-number-or-expecting-end-of-value") {
      if (char === ",") {
        this.state.currentLevel = {
          type: "object",
          status: "expecting-key-or-end-of-object",
        };
      } else if (char === "}") {
        const parentLevel = this.state.levels.pop();
        if (parentLevel) {
          if (parentLevel.type === "object") {
            this.state.currentLevel = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            this.state.currentLevel = {
              type: "array",
              index: parentLevel.index,
              status: "expecting-end-of-item",
            };
          }
        }
        if (this.state.recordingKey) {
          const path = this.state.levels
            .map((l) => (l.type === "array" ? l.index : l.key))
            .join("@CUSTOM@");
          if (path === "output@CUSTOM@contracts") {
            this.state.recordingKey = undefined;
          }
        }
      }
      //  else if (char === "\n" || char === " ") {
      //   return;
      // }
      return;
    }

    if (state.status === "dealing-with-boolean-or-expecting-end-of-value") {
      if (char === ",") {
        this.state.currentLevel = {
          type: "object",
          status: "expecting-key-or-end-of-object",
        };
      } else if (char === "}") {
        const parentLevel = this.state.levels.pop();
        if (parentLevel) {
          if (parentLevel.type === "object") {
            this.state.currentLevel = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            this.state.currentLevel = {
              type: "array",
              index: parentLevel.index,
              status: "expecting-end-of-item",
            };
          }
        }
        if (this.state.recordingKey) {
          const path = this.state.levels
            .map((l) => (l.type === "array" ? l.index : l.key))
            .join("@CUSTOM@");
          if (path === "output@CUSTOM@contracts") {
            this.state.recordingKey = undefined;
          }
        }
      }
      // else if (char === "\n" || char === " ") {
      //   return;
      return;
    }

    if (state.status === "dealing-with-null-or-expecting-end-of-value") {
      if (char === ",") {
        this.state.currentLevel = {
          type: "object",
          status: "expecting-key-or-end-of-object",
        };
      } else if (char === "}") {
        const parentLevel = this.state.levels.pop();
        if (parentLevel) {
          if (parentLevel.type === "object") {
            this.state.currentLevel = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            this.state.currentLevel = {
              type: "array",
              index: parentLevel.index,
              status: "expecting-end-of-item",
            };
          }
        }
        if (this.state.recordingKey) {
          const path = this.state.levels
            .map((l) => (l.type === "array" ? l.index : l.key))
            .join("@CUSTOM@");
          if (path === "output@CUSTOM@contracts") {
            this.state.recordingKey = undefined;
          }
        }
      }
      //  else if (char === "\n" || char === " ") {
      //   return;
      return;
    }

    if (state.status === "expecting-end-of-value") {
      if (char === ",") {
        this.state.currentLevel = {
          type: "object",
          status: "expecting-key-or-end-of-object",
        };
      } else if (char === "}") {
        const parentLevel = this.state.levels.pop();
        if (parentLevel) {
          if (parentLevel.type === "object") {
            this.state.currentLevel = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            this.state.currentLevel = {
              type: "array",
              index: parentLevel.index,
              status: "expecting-end-of-item",
            };
          }
        }
        if (this.state.recordingKey) {
          const path = this.state.levels
            .map((l) => (l.type === "array" ? l.index : l.key))
            .join("@CUSTOM@");
          if (path === "output@CUSTOM@contracts") {
            this.state.recordingKey = undefined;
          }
        }
      } else if (char === "\n" || char === " ") {
        return;
      } else {
        throw new Error(
          `Expecting a "," or "}" for ending the value, got "${char}"`,
        );
      }
      return;
    }

    throw new Error(`Unknown status ${state satisfies never}`);
  }
}

function fun() {
  console.time("fun");
  const stream = createReadStream("releases/v1.3.1/bla.json", {
    // const stream = createReadStream("releases/v1.3.1/a.json", {
    flags: "r",
    encoding: "utf-8",
  });

  const contractTracker = new MoreInvolvedTracker();
  // const contractTracker = new OtherContractTracker();

  stream.on("data", (chunk) => {
    for (let i of chunk) {
      // console.log("state: ", contractTracker.state);
      contractTracker.onChar(i);
    }
  });

  return new Promise((resolve, reject) => {
    stream.on("end", () => {
      // for (let contract in contractTracker.state.contracts) {
      //   // console.log("Contract: ", contract);
      //   // console.log(
      //   //   "Value: ",
      //   //   JSON.parse(contractTracker.state.contracts[contract]),
      //   // );
      // }
      console.log("Stream ended");
      console.timeEnd("fun");
      resolve("Stream ended");
    });
  });
}

async function main() {
  console.time("parse");
  JSON.parse(await readFile("releases/v1.3.1/bla.json", "utf-8"));
  console.timeEnd("parse");
  fun();
}

main();
