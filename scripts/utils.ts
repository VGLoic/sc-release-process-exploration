import { BuildInfo, HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployOptions } from "hardhat-deploy/dist/types";
import { Etherscan } from "@nomicfoundation/hardhat-verify/etherscan";
import { z } from "zod";
import { setTimeout } from "timers/promises";

/**
 * Retrieve an existing deployment or deploy a new one
 * A deployment is considered existing if the contract bytecode is the same than the current one
 * @param hre Hardhat runtime environment
 * @param deploymentName Name of the deployment
 * @param options Deployment options
 * @returns Address of the deployed contract
 */
export async function retrieveOrDeploy(
  hre: HardhatRuntimeEnvironment,
  deploymentName: string,
  options: DeployOptions,
) {
  const result = await hre.deployments.fetchIfDifferent(
    deploymentName,
    options,
  );
  if (!result.differences && result.address) {
    console.log(
      `\n✔️ The deployment ${deploymentName} is known, deployed contract is found at address ${result.address}. Re-using it.\n`,
    );
    return result.address;
  }

  console.log(
    `\n This version of the ${deploymentName} has not been deployed. Deploying it. \n`,
  );
  const deploymentResult = await hre.deployments.deploy(
    deploymentName,
    options,
  );
  console.log(
    `\n✔️ The deployment ${deploymentName} has been successfully realised, the deployed contract can be found at address ${deploymentResult.address} \n`,
  );
  return deploymentResult.address;
}

export function semverStringToSemver(s: string) {
  if (!/^v\d+\.\d+\.\d+$/.test(s)) {
    throw new Error("Invalid semver string");
  }
  const versions = s
    .slice(1)
    .split(".")
    .map((n) => parseInt(n));
  if (versions.some((n) => isNaN(n))) {
    throw new Error("Invalid semver string");
  }

  return { major: versions[0], minor: versions[1], patch: versions[2] };
}

export function findLastRelease(releases: string[]) {
  if (releases.some((r) => !/^v\d+\.\d+\.\d+$/.test(r))) {
    throw new Error("Invalid release names");
  }
  let lastRelease = {
    name: releases[0],
    semver: semverStringToSemver(releases[0]),
  };
  for (let i = 1; i < releases.length; i++) {
    const release = releases[i];
    const semver = semverStringToSemver(release);
    if (semver.major > lastRelease.semver.major) {
      lastRelease = {
        name: release,
        semver,
      };
    }
    if (semver.major === lastRelease.semver.major) {
      if (semver.minor > lastRelease.semver.minor) {
        lastRelease = {
          name: release,
          semver,
        };
      }
      if (semver.minor === lastRelease.semver.minor) {
        if (semver.patch > lastRelease.semver.patch) {
          lastRelease = {
            name: release,
            semver,
          };
        }
      }
    }
  }
  return lastRelease;
}

/**
 * Converts a promise to a promise of a result.
 * @param promise Promise to convert
 * @returns The result of the promise
 */
export function toResult<T>(fn: () => T):
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: unknown;
    } {
  try {
    const result = fn();
    return {
      success: true,
      data: result,
    };
  } catch (err) {
    return {
      success: false,
      error: err,
    };
  }
}

type VerifyPayload = {
  // Address of the deployed contract
  address: string;
  // Source code of the contract - input part of the build info
  sourceCode: BuildInfo["input"];
  // Compiler version - solcLongVersion of the build info
  compilerVersion: string;
  // Source name of the contract - path of the contract file
  sourceName: string;
  // Contract name - name of the contract in the source file
  contractName: string;
  // Libraries if any
  libraries?: {
    address: string;
    sourceName: string;
    contractName: string;
  }[];
  encodedConstructorArgs?: string;
};
/**
 * Verify a contract on Etherscan
 * @dev Only works for Polygon Scan on Mumbai Testnet for now
 * @dev Need to be completed with constructor arguments
 * @param payload Verification payload
 * @param payload.address Address of the deployed contract
 * @param payload.sourceCode Source code of the contract - input part of the build info
 * @param payload.compilerVersion Compiler version - solcLongVersion of the build info
 * @param payload.sourceName Source name of the contract - path of the contract file
 * @param payload.contractName Contract name - name of the contract in the source file
 * @param payload.libraries Libraries if any
 * @param payload.encodedConstructorArgs Encoded constructor arguments
 */
export async function verifyContract(payload: VerifyPayload) {
  const updatedSetting: BuildInfo["input"]["settings"] & {
    libraries: NonNullable<BuildInfo["input"]["settings"]["libraries"]>;
  } = {
    ...payload.sourceCode.settings,
    libraries: {},
  };

  if (payload.libraries) {
    for (const library of payload.libraries) {
      updatedSetting.libraries[library.sourceName] = {
        [library.contractName]: library.address,
      };
    }
  }

  const updatedSourceCode: BuildInfo["input"] = {
    ...payload.sourceCode,
    settings: updatedSetting,
  };
  payload.sourceCode = updatedSourceCode;

  // ******************* End disabling *******************
  for (let i = 0; i < 5; i++) {
    try {
      await verifyContractOnce(payload);
      return;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = (err as any).message as string;
      if (message && message.includes("does not have bytecode")) {
        await setTimeout(2_000);
        continue;
      }

      if (message) {
        console.error(
          `\n⚠️ Verification of ${payload.sourceName}:${payload.contractName} fails. \nIf fail happens because the data is not yet available on the block explorer, feel free to re-trigger the script in a few seconds in order to try to verify again.\n Actual error: `,
          message,
        );
        return;
      }
    }
  }
}

async function verifyContractOnce(payload: VerifyPayload) {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("Missing API key for verification");
  }
  const etherscan = new Etherscan(
    apiKey,
    "https://api-sepolia.etherscan.io/api",
    "https://sepolia.etherscan.io/",
  );

  const isVerified = await etherscan.isVerified(payload.address);

  if (isVerified) {
    console.log("Wunderbar, it's already verified!");
    return;
  }

  const { message: guid } = await etherscan.verify(
    // Contract address
    payload.address,
    // Inputs
    JSON.stringify(payload.sourceCode),
    // Contract full name
    `${payload.sourceName}:${payload.contractName}`,
    // Compiler version
    `v${payload.compilerVersion}`,
    // Encoded constructor arguments
    payload.encodedConstructorArgs ?? "",
  );

  await setTimeout(2_000);

  const verificationStatus = await etherscan.getVerificationStatus(guid);

  if (verificationStatus.isSuccess()) {
    console.log(
      `Successfully verified contract ${payload.sourceName}:${payload.contractName}`,
    );
  } else {
    throw new Error(verificationStatus.message);
  }
}

export function toAsyncResult<T, TError = Error>(
  promise: Promise<T>,
): Promise<{ success: true; value: T } | { success: false; error: TError }> {
  return promise
    .then((value) => ({ success: true as const, value }))
    .catch((error) => ({ success: false as const, error }));
}

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type Literal = z.infer<typeof literalSchema>;
type Json = Literal | { [key: string]: Json } | Json[];
const ZJson: z.ZodType<Json> = z.lazy(() =>
  z.union([literalSchema, z.array(ZJson), z.record(ZJson)]),
);

export const ZContractInfo = z.object({
  abi: z.array(
    z.object({
      inputs: z.array(ZJson),
      name: z.string(),
      outputs: z.array(ZJson),
      stateMutability: z.string(),
      type: z.string(),
    }),
  ),
  devdoc: ZJson,
  evm: z.object({
    bytecode: z.object({
      functionDebugData: ZJson,
      generatedSources: z.array(ZJson),
      linkReferences: ZJson,
      object: z.string(),
      opcodes: z.string(),
      sourceMap: z.string(),
    }),
    deployedBytecode: z.object({
      functionDebugData: ZJson,
      generatedSources: z.array(ZJson),
      linkReferences: ZJson,
      object: z.string(),
      opcodes: z.string(),
      sourceMap: z.string(),
    }),
    gasEstimates: ZJson,
    methodIdentifiers: ZJson,
  }),
  metadata: z.string(),
  storageLayout: ZJson,
  userdoc: ZJson,
});
export const ZBuildInfo = z.object({
  id: z.string(),
  _format: z.string(),
  solcVersion: z.string(),
  solcLongVersion: z.string(),
  input: z.object({
    language: z.string(),
    sources: z.record(z.string(), z.object({ content: z.string() })),
    settings: z.object({
      viaIR: z.boolean().optional(),
      optimizer: z.object({
        runs: z.number().optional(),
        enabled: z.boolean().optional(),
        details: z
          .object({
            yulDetails: z.object({
              optimizerSteps: z.string(),
            }),
          })
          .optional(),
      }),
      metadata: z.object({ useLiteralContent: z.boolean() }).optional(),
      outputSelection: z.record(
        z.string(),
        z.record(z.string(), z.array(z.string())),
      ),
      evmVersion: z.string().optional(),
      libraries: z
        .record(z.string(), z.record(z.string(), z.string()))
        .optional(),
      remappings: z.array(z.string()).optional(),
    }),
  }),
  output: z.object({
    contracts: z.record(z.string(), z.record(z.string(), ZContractInfo)),
  }),
});

export const LOG_COLORS = {
  log: "\x1b[0m%s\x1b[0m",
  success: "\x1b[32m%s\x1b[0m",
  error: "\x1b[31m%s\x1b[0m",
  warn: "\x1b[33m%s\x1b[0m",
};

export class ScriptError extends Error {
  constructor(message: string) {
    super(message);
  }
}
