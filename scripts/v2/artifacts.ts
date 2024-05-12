import fs from "fs/promises";

import * as releasesSummary from "../../releases/generated/summary";
import { BuildInfo, toAsyncResult } from "./utils";

export type Contract = keyof typeof releasesSummary.CONTRACTS;
export type Release = keyof typeof releasesSummary.RELEASES;

export type AvailableReleaseForContract<TContract extends Contract> =
  (typeof releasesSummary.CONTRACTS)[TContract][number];

export type AvailableContractForRelease<TRelease extends Release> =
  (typeof releasesSummary.RELEASES)[TRelease][number];

/**
 * Utility functions for a given contract
 * @param contractKey Key of the contract formatted as "path/to/Contract.sol/Contract"
 * @returns Utility functions for the given contract
 * @example ```typescript
 * const counterUtils = contract("src/Counter.sol/Counter");
 * const availableReleases = counterUtils.getAvailableReleases();
 * const counterArtifact = await counterUtils.getArtifact("v1.3.1");
 * ```
 */
export function contract<TContract extends Contract>(contractKey: TContract) {
  return {
    /**
     * Retrieve the contract artifact for a given release
     * @param release Target release
     * @returns The contract artifact
     * @example ```typescript
     * const counterArtifact = await contract("src/Counter.sol/Counter").getArtifact("v1.3.1");
     * ```
     */
    getArtifact(release: AvailableReleaseForContract<TContract>) {
      return getArtifact(contractKey, release);
    },
    /**
     * Get the available releases for the contract
     * @returns The available releases for the contract
     */
    getAvailableReleases: () => releasesSummary.CONTRACTS[contractKey],
  };
}

/**
 * Utility functions for a given release
 * @param releaseKey Key of the release
 * @returns Utility functions for the given release
 * @example ```typescript
 * const v1_3_1Utils = release("v1.3.1");
 * const availableContracts = v1_3_1Utils.getAvailableContracts();
 * const incrementOracleArtifact = await v1_3_1Utils.getContractArtifact("src/IncrementOracle.sol/IncrementOracle");
 * ```
 */
export function release<TRelease extends Release>(releaseKey: TRelease) {
  return {
    /**
     * Retrieve the contract artifact for a given contract
     * @param contractKey Key of the contract formatted as "path/to/Contract.sol/Contract"
     * @returns The contract artifact
     * @example ```typescript
     * const incrementOracleArtifact = await release("v1.3.1").getContractArtifact("src/IncrementOracle.sol/IncrementOracle");
     * ```
     */
    getContractArtifact<TContract extends Contract>(contractKey: TContract) {
      return getArtifact(contractKey, releaseKey);
    },
    /**
     * Get the available contracts for the release
     * @returns The available contracts for the release
     */
    getAvailableContracts: () => releasesSummary.RELEASES[releaseKey],
  };
}

async function getArtifact(contractKey: string, release: string) {
  const buildInfoContentResult = await toAsyncResult(
    fs
      .readFile(`releases/${release}/build-info.json`, "utf-8")
      .then(JSON.parse),
  );
  if (!buildInfoContentResult.ok) {
    throw new Error(
      `Error reading build-info.json for release ${release}. Skipping`,
    );
  }
  const buildInfoResult = BuildInfo.safeParse(buildInfoContentResult.value);
  if (!buildInfoResult.success) {
    throw new Error(
      `Error parsing build-info.json for release ${release}. Skipping`,
    );
  }

  const contractPieces = contractKey.split("/");
  const contractName = contractPieces.at(-1);
  if (!contractName) {
    throw new Error(
      `Invalid contract key: ${contractKey}. Expected format: "path/to/Contract.sol/Contract"`,
    );
  }
  const contractPath = contractPieces.slice(0, -1).join("/");
  if (!contractPath) {
    throw new Error(
      `Invalid contract key: ${contractKey}. Expected format: "path/to/Contract.sol/Contract"`,
    );
  }
  // Parsing is not perfect, so we take the raw parsed data using JSON.parse
  const contractArtifact =
    buildInfoContentResult.value.output.contracts[contractPath][contractName];
  if (!contractArtifact) {
    throw new Error(
      `Contract artifact not found for contract key: ${contractKey} with release ${release}`,
    );
  }
  return contractArtifact;
}
