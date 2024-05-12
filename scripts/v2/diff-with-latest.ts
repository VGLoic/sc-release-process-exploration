import fs from "fs/promises";
import { z } from "zod";
import { createHash } from "node:crypto";
import { BuildInfo, ContractInfo, toAsyncResult } from "./utils";

/**
 * This script generates the differences between the artifacts generated by a fresh compilation and the ones of the `latest` release.
 *
 * The fresh artifacts are represented by the file at `artifacts/build-info/<build info hash>.json`.
 * The `latest` artifacts are represented by the file at `releases/latest/build-info.json`.
 *
 * For each build info file, the script will parse the `output.contracts` object.
 * This object contains as keys the path of a contract file and as values the contracts within it, i.e.
 * ```
 * {
 *  "output": {
 *   "contracts": {
 *      "path/to/foo.sol": {
 *         "Foo": {
 *             "abi": [...],
 *             "devdoc": {...},
 *             "evm": {
 *                "bytecode": {...},
 *                "deployedBytecode": {...},
 *                ...
 *             },
 *             "metadata": "...",
 *             "storageLayout": {...},
 *             "userdoc": {...}
 *         }
 *      },
 *      "path/to/bar.sol": {
 *         "Bar1": {
 *             "abi": [...],
 *             "devdoc": {...},
 *             "evm": {
 *                "bytecode": {...},
 *                "deployedBytecode": {...},
 *                ...
 *             },
 *             "metadata": "...",
 *             "storageLayout": {...},
 *             "userdoc": {...}
 *         },
 *         "Bar2": {
 *             "abi": [...],
 *             "devdoc": {...},
 *             "evm": {
 *                "bytecode": {...},
 *                "deployedBytecode": {...},
 *                ...
 *             },
 *             "metadata": "...",
 *             "storageLayout": {...},
 *             "userdoc": {...}
 *         },
 *      },
 *   }
 * }
 * ```
 *
 * For each contract, a hash is computed based on
 * - stringified abi,
 * - bytecode object,
 * - metadata
 * This hash is stored in a map with the `<file path>-<contract name>` as key.
 *
 * Comparing the two maps, the script will output the differences between the two sets of contracts.
 */
type Differences = Array<{
  path: string;
  name: string;
  status: "added" | "removed" | "changed";
}>;
export async function generateDiffWithLatest(): Promise<Differences> {
  // We verify that `artifacts/build-info` exists and contains only one json file
  const virtualReleaseBuildInfoPathResult = await toAsyncResult(
    retrieveFreshBuildInfoPath(),
  );
  if (!virtualReleaseBuildInfoPathResult.ok) {
    throw new Error(
      `❌ Error retrieving fresh build info path: ${virtualReleaseBuildInfoPathResult.error}`,
    );
  }

  const virtualReleaseContractHashesResult = await toAsyncResult(
    generateContractHashes(virtualReleaseBuildInfoPathResult.value),
  );

  if (!virtualReleaseContractHashesResult.ok) {
    throw new Error(
      `❌ Error generating virtual release contract hashes: ${virtualReleaseContractHashesResult.error}`,
    );
  }

  const LATEST_RELEASE_PATH = "releases/latest/build-info.json";
  const hasLatestRelease = await fs
    .stat(LATEST_RELEASE_PATH)
    .catch(() => false);
  if (!hasLatestRelease) {
    const differences: Differences = [];
    for (const contractKey of virtualReleaseContractHashesResult.value.keys()) {
      const { contractPath, contractName } = parseKey(contractKey);
      differences.push({
        path: contractPath,
        name: contractName,
        status: "added",
      });
    }
    return differences;
  }

  const latestReleaseContractHashesResult = await toAsyncResult(
    generateContractHashes(LATEST_RELEASE_PATH),
  );
  if (!latestReleaseContractHashesResult.ok) {
    throw new Error(
      `❌ Error generating latest release contract hashes: ${latestReleaseContractHashesResult.error}`,
    );
  }

  const differences: Differences = [];
  for (const [
    contractKey,
    contractHash,
  ] of virtualReleaseContractHashesResult.value.entries()) {
    const { contractPath, contractName } = parseKey(contractKey);
    const latestReleaseHash =
      latestReleaseContractHashesResult.value.get(contractKey);
    if (!latestReleaseHash) {
      differences.push({
        path: contractPath,
        name: contractName,
        status: "added",
      });
    } else if (latestReleaseHash !== contractHash) {
      differences.push({
        path: contractPath,
        name: contractName,
        status: "changed",
      });
    }
  }

  for (const contractKey of latestReleaseContractHashesResult.value.keys()) {
    if (!virtualReleaseContractHashesResult.value.has(contractKey)) {
      const { contractPath, contractName } = parseKey(contractKey);
      differences.push({
        path: contractPath,
        name: contractName,
        status: "removed",
      });
    }
  }

  return differences;
}

async function retrieveFreshBuildInfoPath(): Promise<string> {
  const BUILD_INFO_PATH = "artifacts/build-info";
  const hasBuildInfoFolder = await fs.stat(BUILD_INFO_PATH).catch(() => false);
  if (!hasBuildInfoFolder) {
    throw new Error(`Build info folder not found at ${BUILD_INFO_PATH}`);
  }

  const buildInfoFolderResult = await toAsyncResult(
    fs.readdir(BUILD_INFO_PATH),
  );
  if (!buildInfoFolderResult.ok) {
    throw new Error(
      `Error reading build info folder: ${buildInfoFolderResult.error}`,
    );
  }

  if (buildInfoFolderResult.value.length > 1) {
    throw new Error(
      `Expected exactly one build info file, found ${buildInfoFolderResult.value.length}`,
    );
  }
  const buildInfoFileName = buildInfoFolderResult.value.at(0);
  if (!buildInfoFileName) {
    throw new Error(`No build info file found`);
  }
  if (!buildInfoFileName.endsWith(".json")) {
    throw new Error(`Build info file is not a json file: ${buildInfoFileName}`);
  }

  return `${BUILD_INFO_PATH}/${buildInfoFileName}`;
}

async function generateContractHashes(
  buildInfoPath: string,
): Promise<Map<string, string>> {
  const buildInfoReadingResult = await toAsyncResult(
    fs.readFile(buildInfoPath, "utf8").then(JSON.parse),
  );
  if (!buildInfoReadingResult.ok) {
    throw new Error(
      `Error reading build info file: ${buildInfoReadingResult.error}`,
    );
  }

  const buildInfoResult = BuildInfo.safeParse(buildInfoReadingResult.value);
  if (!buildInfoResult.success) {
    throw new Error(`Invalid build info file: ${buildInfoResult.error}`);
  }

  const contractHashes = new Map<string, string>();
  for (const contractPath in buildInfoResult.data.output.contracts) {
    const contracts = buildInfoResult.data.output.contracts[contractPath];
    for (const contractName in contracts) {
      const contract = contracts[contractName];
      const hash = hashContract(contract);
      contractHashes.set(formKey(contractPath, contractName), hash);
    }
  }

  return contractHashes;
}

function hashContract(contract: z.infer<typeof ContractInfo>): string {
  const hash = createHash("sha256");

  contract.abi.sort((a, b) => a.name.localeCompare(b.name));
  for (const abiItem of contract.abi) {
    hash.update(JSON.stringify(abiItem));
  }

  hash.update(contract.evm.bytecode.object);
  hash.update(contract.metadata);

  return hash.digest("hex");
}

const SEPARATOR = "@@@@";
function formKey(contractPath: string, contractName: string): string {
  return `${contractPath}${SEPARATOR}${contractName}`;
}
function parseKey(key: string): { contractPath: string; contractName: string } {
  const [contractPath, contractName] = key.split(SEPARATOR);
  if (!contractPath || !contractName) {
    throw new Error(`Invalid key: ${key}`);
  }
  return { contractPath, contractName };
}
