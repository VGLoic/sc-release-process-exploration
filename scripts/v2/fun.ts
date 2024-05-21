import { createReadStream } from "fs";

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
} & ( // Can transit to `dealing-with-number-or-expecting-comma` or `dealing-with-string` or `dealing-with-object` or `dealing-with-array` or going out of the level
  | {
      status: "identifying-value-type";
    }
  // Can transit to `identifying-value-type` or going out of the level
  | {
      status: "dealing-with-number-or-expecting-comma";
      value: string;
    }
  // Can transit to `identifying-value-type` or going out of the level
  | {
      status: "dealing-with-boolean-or-expecting-comma";
      value: string;
    }
  // Can transit to `identifying-value-type` or going out of the level
  | {
      status: "dealing-with-null-or-expecting-comma";
      value: string;
    }
  // Can transit to `expecting-end-of-item`
  | {
      status: "dealing-with-string";
      value: string;
      isNextCharEscaped: boolean;
    }
  // Can transit to `expecting-end-of-item` or going out of level
  | {
      status: "dealing-with-object";
    }
  // Can transit to `expecting-end-of-item` or going out of level
  | {
      status: "dealing-with-array";
    }
  // Can transit to `identifying-value-type` or going out of level
  | {
      status: "expecting-end-of-item";
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
  // Can transit to `dealing-with-number-or-expecting-comma` or `dealing-with-string` or `dealing-with-object` or `dealing-with-array` or `expecting-key-or-end-of-object`
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
      value: string;
    }
  // Can transit to `expecting-key-or-end-of-object` or going out of the level
  // Expecting either a part of boolean string, either a comma `,`, either `}`
  | {
      status: "dealing-with-boolean-or-expecting-end-of-value";
      key: string;
      value: string;
    }
  // Can transit to `expecting-key-or-end-of-object` or going out of the level
  // Expecting either a part of `null` string, either a comma `,`, either `}`
  | {
      status: "dealing-with-null-or-expecting-end-of-value";
      key: string;
      value: string;
    }
  // Can transit to `expecting-end-of-value`
  // Expecting either a string, either a ditto mark `"`
  | {
      status: "dealing-with-string";
      key: string;
      value: string;
      isNextCharEscaped: boolean;
    }
  // Can transit to `expecting-end-of-value`
  | {
      status: "dealing-with-object";
      key: string;
    }
  // Can transit to `expecting-end-of-value`
  | {
      status: "dealing-with-array";
      key: string;
    }
  // Can transit to `expecting-key-or-end-of-object` or going out of the level
  // Expecting a comma `,` or `}`
  | {
      status: "expecting-end-of-value";
      key: string;
    }
);

type State = {
  levels: (ObjectState | ArrayState)[];
};

class MoreInvolvedTracker {
  public state: State = {
    levels: [],
  };

  onChar(char: number | string) {
    const state = this.state.levels.at(-1);
    if (!state) {
      if (char === "{") {
        this.state.levels.push({
          type: "object",
          status: "expecting-key-or-end-of-object",
        });
      } else if (char === " " || char === "\n") {
        return;
      } else {
        throw new Error(`Unhandled character at root: "${char}"`);
      }
      return;
    }

    if (state.type === "object") {
      this.onCharWithObjectState(state, char);
    } else {
      this.onCharWithArrayState(state, char);
    }
  }

  onCharWithArrayState(state: ArrayState, char: number | string) {
    const depth = this.state.levels.length;

    if (state.status === "identifying-value-type") {
      switch (char) {
        case "\n":
        case " ":
          break;
        case '"':
          this.state.levels[depth - 1] = {
            type: "array",
            status: "dealing-with-string",
            value: "",
            isNextCharEscaped: false,
          };
          break;
        case "{":
          this.state.levels[depth - 1] = {
            type: "array",
            status: "dealing-with-object",
          };
          this.state.levels.push({
            type: "object",
            status: "expecting-key-or-end-of-object",
          });
          break;
        case "[":
          this.state.levels[depth - 1] = {
            type: "array",
            status: "dealing-with-array",
          };
          this.state.levels.push({
            type: "array",
            status: "identifying-value-type",
          });
          break;
        case "]":
          this.state.levels.pop();
          const parentLevel = this.state.levels.at(-1);
          if (parentLevel) {
            if (parentLevel.type === "array") {
              if (parentLevel.status === "dealing-with-array") {
                this.state.levels[depth - 2] = {
                  type: "array",
                  status: "expecting-end-of-item",
                };
                return;
              } else {
                throw new Error(
                  `Expected parent state with status "dealing-with-array", got ${JSON.stringify(
                    parentLevel,
                    null,
                    2,
                  )}`,
                );
              }
            } else {
              if (parentLevel.status === "dealing-with-array") {
                this.state.levels[depth - 2] = {
                  type: "object",
                  key: parentLevel.key,
                  status: "expecting-end-of-value",
                };
                return;
              }
            }
          }
        case "t":
        case "f":
          this.state.levels[depth - 1] = {
            type: "array",
            status: "dealing-with-boolean-or-expecting-comma",
            value: char.toString(),
          };
          break;
        case "n":
          this.state.levels[depth - 1] = {
            type: "array",
            status: "dealing-with-null-or-expecting-comma",
            value: char.toString(),
          };
          break;
        default:
          if (!isNaN(Number(char))) {
            this.state.levels[depth - 1] = {
              type: "array",
              status: "dealing-with-number-or-expecting-comma",
              value: char.toString(),
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
        this.state.levels[depth - 1] = {
          type: "array",
          status: "identifying-value-type",
        };
      } else if (char === "]") {
        this.state.levels.pop();
        const parentLevel = this.state.levels.at(-1);
        if (parentLevel) {
          if (parentLevel.type === "array") {
            if (parentLevel.status === "dealing-with-array") {
              this.state.levels[depth - 2] = {
                type: "array",
                status: "expecting-end-of-item",
              };
              return;
            } else {
              throw new Error(
                `Expected parent state with status "dealing-with-array", got ${JSON.stringify(
                  parentLevel,
                  null,
                  2,
                )}`,
              );
            }
          } else {
            if (parentLevel.status === "dealing-with-array") {
              this.state.levels[depth - 2] = {
                type: "object",
                key: parentLevel.key,
                status: "expecting-end-of-value",
              };
              return;
            }
          }
        }
      } else if (char === "\n" || char === " ") {
        return;
      } else {
        state.value += char;
        this.state.levels[depth - 1] = state;
      }
      return;
    }

    if (state.status === "dealing-with-boolean-or-expecting-comma") {
      if (char === ",") {
        this.state.levels[depth - 1] = {
          type: "array",
          status: "identifying-value-type",
        };
      } else if (char === "]") {
        this.state.levels.pop();
        const parentLevel = this.state.levels.at(-1);
        if (parentLevel) {
          if (parentLevel.type === "array") {
            if (parentLevel.status === "dealing-with-array") {
              this.state.levels[depth - 2] = {
                type: "array",
                status: "expecting-end-of-item",
              };
              return;
            } else {
              throw new Error(
                `Expected parent state with status "dealing-with-array", got ${JSON.stringify(
                  parentLevel,
                  null,
                  2,
                )}`,
              );
            }
          } else {
            if (parentLevel.status === "dealing-with-array") {
              this.state.levels[depth - 2] = {
                type: "object",
                key: parentLevel.key,
                status: "expecting-end-of-value",
              };
              return;
            }
          }
        }
      } else if (char === "\n" || char === " ") {
        return;
      } else {
        state.value += char;
        this.state.levels[depth - 1] = state;
      }
      return;
    }

    if (state.status === "dealing-with-null-or-expecting-comma") {
      if (char === ",") {
        this.state.levels[depth - 1] = {
          type: "array",
          status: "identifying-value-type",
        };
      } else if (char === "]") {
        this.state.levels.pop();
        const parentLevel = this.state.levels.at(-1);
        if (parentLevel) {
          if (parentLevel.type === "array") {
            if (parentLevel.status === "dealing-with-array") {
              this.state.levels[depth - 2] = {
                type: "array",
                status: "expecting-end-of-item",
              };
              return;
            } else {
              throw new Error(
                `Expected parent state with status "dealing-with-array", got ${JSON.stringify(
                  parentLevel,
                  null,
                  2,
                )}`,
              );
            }
          } else {
            if (parentLevel.status === "dealing-with-array") {
              this.state.levels[depth - 2] = {
                type: "object",
                key: parentLevel.key,
                status: "expecting-end-of-value",
              };
              return;
            }
          }
        }
      } else if (char === "\n" || char === " ") {
        return;
      } else {
        state.value += char;
        this.state.levels[depth - 1] = state;
      }
      return;
    }

    if (state.status === "dealing-with-string") {
      if (char === "\\") {
        state.value += char;
        state.isNextCharEscaped = true;
        this.state.levels[depth - 1] = state;
        return;
      }
      if (char === '"') {
        if (!state.isNextCharEscaped) {
          this.state.levels[depth - 1] = {
            type: "array",
            status: "expecting-end-of-item",
          };
          return;
        }
      }
      state.isNextCharEscaped = false;
      state.value += char;
      this.state.levels[depth - 1] = state;
      return;
    }

    if (state.status === "expecting-end-of-item") {
      if (char === ",") {
        this.state.levels[depth - 1] = {
          type: "array",
          status: "identifying-value-type",
        };
      } else if (char === "]") {
        this.state.levels.pop();
        const parentLevel = this.state.levels.at(-1);
        if (parentLevel) {
          if (parentLevel.type === "array") {
            if (parentLevel.status === "dealing-with-array") {
              this.state.levels[depth - 2] = {
                type: "array",
                status: "expecting-end-of-item",
              };
              return;
            } else {
              throw new Error(
                `Expected parent state with status "dealing-with-array", got ${JSON.stringify(
                  parentLevel,
                  null,
                  2,
                )}`,
              );
            }
          } else {
            if (parentLevel.status === "dealing-with-array") {
              this.state.levels[depth - 2] = {
                type: "object",
                key: parentLevel.key,
                status: "expecting-end-of-value",
              };
              return;
            }
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

    if (
      state.status === "dealing-with-array" ||
      state.status === "dealing-with-object"
    ) {
      throw new Error("Unreachable case");
    }

    throw new Error(`Unknown status ${state satisfies never}`);
  }

  onCharWithObjectState(state: ObjectState, char: number | string) {
    const depth = this.state.levels.length;

    if (state.status === "identifying-value-type") {
      switch (char) {
        case "\n":
        case " ":
          break;
        case '"':
          this.state.levels[depth - 1] = {
            type: "object",
            status: "dealing-with-string",
            key: state.key,
            value: "",
            isNextCharEscaped: false,
          };
          break;
        case "{":
          this.state.levels[depth - 1] = {
            type: "object",
            status: "dealing-with-object",
            key: state.key,
          };
          this.state.levels.push({
            type: "object",
            status: "expecting-key-or-end-of-object",
          });
          break;
        case "[":
          this.state.levels[depth - 1] = {
            type: "object",
            key: state.key,
            status: "dealing-with-array",
          };
          this.state.levels.push({
            type: "array",
            status: "identifying-value-type",
          });
          break;
        case "t":
        case "f":
          this.state.levels[depth - 1] = {
            type: "object",
            status: "dealing-with-boolean-or-expecting-end-of-value",
            key: state.key,
            value: char.toString(),
          };
          break;
        case "n":
          this.state.levels[depth - 1] = {
            type: "object",
            status: "dealing-with-null-or-expecting-end-of-value",
            key: state.key,
            value: char.toString(),
          };
          break;
        default:
          if (!isNaN(Number(char))) {
            this.state.levels[depth - 1] = {
              type: "object",
              status: "dealing-with-number-or-expecting-end-of-value",
              key: state.key,
              value: char.toString(),
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
        this.state.levels[depth - 1] = {
          type: "object",
          status: "building-key",
          key: "",
          isNextCharEscaped: false,
        };
      } else if (char === "}") {
        this.state.levels.pop();
        const parentLevel = this.state.levels.at(-1);
        if (parentLevel) {
          if (parentLevel.type === "object") {
            if (parentLevel.status !== "dealing-with-object") {
              throw new Error(
                `Impossible case, expecting parent level to have "dealing-with-object-status", got ${parentLevel.status}`,
              );
            }
            this.state.levels[depth - 2] = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            if (parentLevel.status !== "dealing-with-object") {
              throw new Error(
                `Impossible case, expecting parent level to have "dealing-with-object-status", got ${parentLevel.status}`,
              );
            }
            this.state.levels[depth - 2] = {
              type: "array",
              status: "expecting-end-of-item",
            };
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
          this.state.levels[depth - 1] = {
            type: "object",
            status: "expecting-transition-to-value",
            key: state.key,
          };
          return;
        }
      }

      state.isNextCharEscaped = false;
      state.key += char;
      this.state.levels[depth - 1] = state;
      return;
    }

    if (state.status === "expecting-transition-to-value") {
      if (char === ":") {
        this.state.levels[depth - 1] = {
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
        state.value += char;
        state.isNextCharEscaped = true;
        this.state.levels[depth - 1] = state;
        return;
      }
      if (char === '"') {
        if (!state.isNextCharEscaped) {
          this.state.levels[depth - 1] = {
            type: "object",
            status: "expecting-end-of-value",
            key: state.key,
          };
          return;
        }
      }
      state.isNextCharEscaped = false;
      state.value += char;
      this.state.levels[depth - 1] = state;
      return;
    }

    if (state.status === "dealing-with-number-or-expecting-end-of-value") {
      if (char === ",") {
        this.state.levels[depth - 1] = {
          type: "object",
          status: "expecting-key-or-end-of-object",
        };
      } else if (char === "}") {
        this.state.levels.pop();
        const parentLevel = this.state.levels.at(-1);
        if (parentLevel) {
          if (parentLevel.type === "object") {
            if (parentLevel.status !== "dealing-with-object") {
              throw new Error(
                `Impossible case, expecting parent level to have "dealing-with-object-status", got ${parentLevel.status}`,
              );
            }
            this.state.levels[depth - 2] = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            if (parentLevel.status !== "dealing-with-object") {
              throw new Error(
                `Impossible case, expecting parent level to have "dealing-with-object-status", got ${parentLevel.status}`,
              );
            }
            this.state.levels[depth - 2] = {
              type: "array",
              status: "expecting-end-of-item",
            };
          }
        }
      } else if (char === "\n" || char === " ") {
        return;
      } else {
        state.value += char;
        this.state.levels[depth - 1] = state;
      }
      return;
    }

    if (state.status === "dealing-with-boolean-or-expecting-end-of-value") {
      if (char === ",") {
        this.state.levels[depth - 1] = {
          type: "object",
          status: "expecting-key-or-end-of-object",
        };
      } else if (char === "}") {
        this.state.levels.pop();
        const parentLevel = this.state.levels.at(-1);
        if (parentLevel) {
          if (parentLevel.type === "object") {
            if (parentLevel.status !== "dealing-with-object") {
              throw new Error(
                `Impossible case, expecting parent level to have "dealing-with-object-status", got ${parentLevel.status}`,
              );
            }
            this.state.levels[depth - 2] = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            if (parentLevel.status !== "dealing-with-object") {
              throw new Error(
                `Impossible case, expecting parent level to have "dealing-with-object-status", got ${parentLevel.status}`,
              );
            }
            this.state.levels[depth - 2] = {
              type: "array",
              status: "expecting-end-of-item",
            };
          }
        }
      } else if (char === "\n" || char === " ") {
        return;
      } else {
        state.value += char;
        this.state.levels[depth - 1] = state;
      }
      return;
    }

    if (state.status === "dealing-with-null-or-expecting-end-of-value") {
      if (char === ",") {
        this.state.levels[depth - 1] = {
          type: "object",
          status: "expecting-key-or-end-of-object",
        };
      } else if (char === "}") {
        this.state.levels.pop();
        const parentLevel = this.state.levels.at(-1);
        if (parentLevel) {
          if (parentLevel.type === "object") {
            if (parentLevel.status !== "dealing-with-object") {
              throw new Error(
                `Impossible case, expecting parent level to have "dealing-with-object-status", got ${parentLevel.status}`,
              );
            }
            this.state.levels[depth - 2] = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            if (parentLevel.status !== "dealing-with-object") {
              throw new Error(
                `Impossible case, expecting parent level to have "dealing-with-object-status", got ${parentLevel.status}`,
              );
            }
            this.state.levels[depth - 2] = {
              type: "array",
              status: "expecting-end-of-item",
            };
          }
        }
      } else if (char === "\n" || char === " ") {
        return;
      } else {
        state.value += char;
        this.state.levels[depth - 1] = state;
      }
      return;
    }

    if (state.status === "expecting-end-of-value") {
      if (char === ",") {
        this.state.levels[depth - 1] = {
          type: "object",
          status: "expecting-key-or-end-of-object",
        };
      } else if (char === "}") {
        this.state.levels.pop();
        const parentLevel = this.state.levels.at(-1);
        if (parentLevel) {
          if (parentLevel.type === "object") {
            if (parentLevel.status !== "dealing-with-object") {
              throw new Error(
                `Impossible case, expecting parent level to have "dealing-with-object-status", got ${parentLevel.status}`,
              );
            }
            this.state.levels[depth - 2] = {
              type: "object",
              status: "expecting-end-of-value",
              key: parentLevel.key,
            };
          } else {
            if (parentLevel.status !== "dealing-with-object") {
              throw new Error(
                `Impossible case, expecting parent level to have "dealing-with-object-status", got ${parentLevel.status}`,
              );
            }
            this.state.levels[depth - 2] = {
              type: "array",
              status: "expecting-end-of-item",
            };
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

    if (
      state.status === "dealing-with-object" ||
      state.status === "dealing-with-array"
    ) {
      throw new Error("Unreachable case");
    }

    throw new Error(`Unknown status ${state satisfies never}`);
  }
}

function fun() {
  const stream = createReadStream("releases/latest/build-info.json", {
    // const stream = createReadStream("releases/v1.3.1/a.json", {
    flags: "r",
    encoding: "utf-8",
  });

  const contractTracker = new MoreInvolvedTracker();
  // const contractTracker = new OtherContractTracker();

  stream.on("data", (chunk) => {
    for (let i of chunk) {
      console.log("state: ", contractTracker.state);
      contractTracker.onChar(i);
    }
  });

  return new Promise((resolve, reject) => {
    stream.on("end", () => {
      console.log("Stream ended");
      resolve("Stream ended");
    });
  });
}

// type Level =
//   | {
//       key: string;
//       type: "object";
//     }
//   | {
//       key: string;
//       type: "array";
//       index: number;
//     };
// class OtherContractTracker {
//   public state: {
//     levels: Level[];
//     key: string | undefined;
//     escapeState:
//       | {
//           isEscaped: false;
//         }
//       | {
//           isEscaped: true;
//           isNextCharEscaped: boolean;
//           word: string;
//         };
//     inRoot: boolean;
//   } = {
//     levels: [],
//     key: undefined,
//     escapeState: { isEscaped: false },
//     inRoot: false,
//   };

//   onChar(char: string | number) {
//     const escapeState = this.state.escapeState;
//     if (!escapeState.isEscaped) {
//       if (char === ":") {
//         return;
//       }
//       if (char === ",") {
//         const lastLevel = this.state.levels.at(-1);
//         if (lastLevel?.type === "array") {
//           lastLevel.index += 1;
//         }
//         return;
//       }

//       if (char === "[") {
//       }

//       // Entering a new level in the JSON
//       if (char === "{") {
//         const key = this.state.key;
//         if (!key) {
//           if (this.state.inRoot && this.state.levels.at(-1)?.type !== "array") {
//             throw new Error("Impossible case: should have key unless in array");
//           } else {
//             this.state.inRoot = true;
//           }
//         } else {
//           if (!this.state.inRoot) {
//             throw new Error("Kaput 2");
//           }
//           if (key) {
//             this.state.levels.push({ key, type: "object" });
//             this.state.key = undefined;
//           }
//         }
//         return;
//       }
//       // Going out of a level in the JSON
//       if (char === "}") {
//         const removedKey = this.state.levels.pop();
//         if (!removedKey) {
//           if (this.state.inRoot) {
//             this.state.inRoot = false;
//           } else {
//             throw new Error("Kaput 3");
//           }
//         }
//         return;
//       }

//       // Transitionning into a string
//       if (char === '"') {
//         this.state.escapeState = {
//           isEscaped: true,
//           isNextCharEscaped: false,
//           word: "",
//         };
//         return;
//       }
//     } else {
//       // Transitionning out of the string
//       if (char === '"') {
//         if (!escapeState.isNextCharEscaped) {
//           const hasKey = this.state.key;
//           if (!hasKey) {
//             console.log("found key: ", escapeState.word);
//             this.state.key = escapeState.word;
//           } else {
//             console.log("found value: ", escapeState.word);
//             this.state.key = undefined;
//           }
//           this.state.escapeState = {
//             isEscaped: false,
//           };
//           return;
//         }
//       }

//       // Meeting an escaping character
//       if (char === "\\") {
//         escapeState.isNextCharEscaped = true;
//       } else {
//         escapeState.isNextCharEscaped = false;
//       }

//       // Add new part
//       escapeState.word += char;
//       return;
//     }
//   }
// }

// type State = {
//   contractStatus: "not-reached" | "reached" | "leaved";
//   // Levels of nesting within the JSON object
//   levels: string[];
//   // Last word that was parsed
//   previousWord: string;
//   // Whether the current character is within a string
//   escapeState:
//     | {
//         isEscaped: false;
//       }
//     | {
//         isEscaped: true;
//         isNextCharEscaped: boolean;
//         word: string;
//       };
// };

// class ContractTracker {
//   public state: State = {
//     contractStatus: "not-reached",
//     levels: [],
//     previousWord: "",
//     escapeState: {
//       isEscaped: false,
//     },
//   };

//   handleChar(char: string | number) {
//     const escapeState = this.state.escapeState;

//     if (!escapeState.isEscaped) {
//       if (char === ":" || char === ",") {
//         return;
//       }
//       if (char === "{") {
//         this.state.levels.push(this.state.previousWord);
//         if (this.state.levels.at(-1) === "contracts") {
//           if (this.state.contractStatus === "not-reached") {
//             this.state.contractStatus = "reached";
//             console.log("Reached contracts");
//           }
//         }
//         console.log("Levels: ", this.state.levels);
//         return;
//       }
//       if (char === "}") {
//         if (this.state.levels.at(-1) === "contracts") {
//           this.state.contractStatus = "leaved";
//           console.log("Leaved");
//         }
//         this.state.levels.pop();
//         console.log("Levels: ", this.state.levels);
//         return;
//       }
//       if (char === '"') {
//         this.state.escapeState = {
//           isEscaped: true,
//           isNextCharEscaped: false,
//           word: "",
//         };
//         return;
//       }
//     } else {
//       if (char === '"') {
//         if (!escapeState.isNextCharEscaped) {
//           this.state.previousWord = escapeState.word;
//           this.state.escapeState = { isEscaped: false };
//         }
//         return;
//       }

//       escapeState.word += char;
//       if (char === "\\") {
//         escapeState.isNextCharEscaped = true;
//       } else {
//         escapeState.isNextCharEscaped = false;
//       }
//       this.state.escapeState = escapeState;
//       return;
//     }
//   }

//   onChar(char: string | number) {
//     this.handleChar(char);

//     // const escapeState = this.state.escapeState;
//     // if (!escapeState.isEscaped) {
//     //   if (char === ":" || char === ",") {
//     //     return;
//     //   }
//     //   if (char === "{") {
//     //     this.state.levels.push(this.state.previousWord);
//     //     if (this.state.levels.at(-1) === "contracts") {
//     //       if (this.contractState === "not-reached") {
//     //         this.contractState = "reached";
//     //         console.log("Reached contracts");
//     //       }
//     //       if (this.contractState === "reached") {
//     //         this.contractState = "leaved";
//     //         console.log("Leaved contracts");
//     //       }
//     //     }
//     //     // console.log("Levels: ", this.state.levels);
//     //     return;
//     //   }
//     //   if (char === "}") {
//     //     this.state.levels.pop();
//     //     // console.log("Levels: ", this.state.levels);
//     //     return;
//     //   }
//     //   if (char === '"') {
//     //     this.state.escapeState = {
//     //       isEscaped: true,
//     //       isNextCharEscaped: false,
//     //       word: "",
//     //     };
//     //     return;
//     //   }
//     // } else {
//     //   if (char === '"') {
//     //     if (!escapeState.isNextCharEscaped) {
//     //       this.state.previousWord = escapeState.word;
//     //       this.state.escapeState = { isEscaped: false };
//     //     }
//     //     return;
//     //   }

//     //   escapeState.word += char;
//     //   if (char === "\\") {
//     //     escapeState.isNextCharEscaped = true;
//     //     this.state.escapeState = escapeState;
//     //     return;
//     //   } else {
//     //     escapeState.isNextCharEscaped = false;
//     //     this.state.escapeState = escapeState;
//     //     return;
//     //   }
//     // }
//   }
// }

fun();
