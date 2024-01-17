import fs from "fs/promises";
import { toResult } from "./utils";
import { build as tsupBuild } from "tsup";
import path from "node:path";
import {
  DIST_FOLDER,
  GENERATED_DELTA_CONTRACTS_ARTIFACTS_FOLDER,
  RELEASES_FOLDER,
} from "./constants";

// Temporary `dist-tmp` folder for storing the files waiting to be bundled
const DIST_TMP_FOLDER = path.join(__dirname, "../../dist-tmp");
const DIST_TMP_FOLDER_FOR_BUNDLE = path.join(DIST_TMP_FOLDER, "for-bundle");
const DIST_TMP_FOLDER_JSON = path.join(DIST_TMP_FOLDER, "json");
// Old `dist` folder in case the build fails
const DIST_OLD_FOLDER = path.join(__dirname, "../../dist-old");

/**
 * Based on the releases and generated delta artifacts folders,
 * this script will create a new `dist` folder with the following structure:
 * ```
 * dist
 * ├── <contract-name>
 * │   ├── <release-name a>.json
 * │   ├── <release-name a>.js
 * │   ├── <release-name a>.d.ts
 * │   ├── <release-name b>.json
 * │   ├── <release-name b>.js
 * │   ├── <release-name b>.d.ts
 * │   └── ...
 * └── ...
 * ```
 * The `.json` files will contain the ABI of the contract at the corresponding version.
 * The `.js` files will contain a `abi` TypeScript `const` with the ABI of the contract at the corresponding version.
 *
 * During the process, the current `dist` folder will be renamed to `dist-old`.
 * If the process is successful, the `dist-old` folder will be removed.
 * If the process fails, the `dist` folder will be removed and the `dist-old` folder will be renamed back to `dist`.
 *
 * The script will start by creating a new `dist-tmp` folder with the following structure:
 * ```
 * dist-tmp
 * ├── for-bundle
 * │   ├── <contract-name>
 * │   │   ├── <version a>.ts
 * │   │   ├── <version b>.ts
 * │   │   └── ...
 * │   └── ...
 * └── json
 *     ├── <contract-name>
 *     │   ├── <version a>.json
 *     │   ├── <version b>.json
 *     │   └── ...
 *     └── ...
 * ```
 * The `for-bundle` folder will contain a TypeScript file for each version of each contract and will be used to bundle the contracts using `tsup`.
 * The `json` folder will contain a JSON file for each version of each contract and will be used to create the `.json` files in the `dist` folder by copy.
 * This folder will be removed at the end of the process.
 *
 * @dev This script is meant to be run after `scripts/prepare-release.ts` and `scripts/generate-delta.ts`.
 *
 * @dev Assumptions:
 * - The `releases` folder exists and follows the structure described in `scripts/prepare-release.ts`,
 * - The `releases/generated-delta/contracts` folder exists and contains the generated delta artifacts. See `scripts/generate-delta.ts` for more details and the expected structure.
 * - The generated delta artifacts are JSON files with an `abi` property.
 */
async function build() {
  const hasReleasesFolder = await fs.stat(RELEASES_FOLDER).catch(() => false);
  if (!hasReleasesFolder) {
    // Exit if there are no releases
    console.error(
      `❌ Releases folder has not been found at \`${RELEASES_FOLDER}\`. Build cancelled.`,
    );
    process.exitCode = 1;
    return;
  }

  const hasGeneratedDeltaArtifactsFolder = await fs
    .stat(GENERATED_DELTA_CONTRACTS_ARTIFACTS_FOLDER)
    .catch(() => false);
  if (!hasGeneratedDeltaArtifactsFolder) {
    // Exit if there are no generated delta
    console.error(
      `❌ Generated delta artifacts folder has not been found at \`${GENERATED_DELTA_CONTRACTS_ARTIFACTS_FOLDER}\`. Build cancelled.`,
    );
    process.exitCode = 1;
    return;
  }

  // Remove the `dist-tmp` folder if it exists
  const hasDistTmpFolder = await fs.stat(DIST_TMP_FOLDER).catch(() => false);
  if (hasDistTmpFolder) {
    const removeDistTmpResult = await toResult(
      fs.rm(DIST_TMP_FOLDER, { recursive: true }),
    );
    if (!removeDistTmpResult.ok) {
      // Exit if there was an error removing the `dist-tmp` folder
      console.error(
        `❌ There was an error removing the \`${DIST_TMP_FOLDER}\` folder. Please remove it manually. Build cancelled.`,
      );
      console.error(removeDistTmpResult.error);
      process.exitCode = 1;
      return;
    }
  }
  // Create the `dist-tmp` folder
  const createDistTmpResult = await toResult(fs.mkdir(DIST_TMP_FOLDER));
  if (!createDistTmpResult.ok) {
    // Exit if there was an error creating the `dist` folder
    console.error(
      `❌ There was an error creating the new \`${DIST_TMP_FOLDER}\` folder. Build cancelled. Please check the error and retry.`,
    );
    console.error(createDistTmpResult.error);
    process.exitCode = 1;
    return;
  }

  // Fill the new `dist-tmp` folder
  const fillDistTmpFolderResult = await toResult(fillDistTmpFolder());
  if (!fillDistTmpFolderResult.ok) {
    await fs.rm(DIST_TMP_FOLDER, { recursive: true }).catch((e) => {
      console.warn(
        `⚠️ There was an error removing the \`${DIST_TMP_FOLDER}\` folder. Please remove it manually.`,
      );
      console.warn(e);
    });
    console.error(
      `❌ There was an error filling the new \`${DIST_TMP_FOLDER}\` folder. Build cancelled. Please check the error and retry.`,
    );
    console.error(fillDistTmpFolderResult.error);
    process.exitCode = 1;
    return;
  }

  // If `dist` folder exists
  // Remove the current `dist-old` folder
  // Rename the current `dist` folder to `dist-old`
  const hasDistFolder = await fs.stat(DIST_FOLDER).catch(() => false);
  if (hasDistFolder) {
    const hasDistOldFolder = await fs.stat(DIST_OLD_FOLDER).catch(() => false);
    if (hasDistOldFolder) {
      const removeDistOldResult = await toResult(
        fs.rm(DIST_OLD_FOLDER, { recursive: true }),
      );
      if (!removeDistOldResult.ok) {
        // Exit if there was an error removing the `dist-old` folder
        console.error(
          `❌ There was an error removing the \`${DIST_OLD_FOLDER}\` folder. Please remove it manually. Build cancelled.`,
        );
        console.error(removeDistOldResult.error);
        process.exitCode = 1;
        return;
      }
    }
    const renameResult = await toResult(
      fs.rename(DIST_FOLDER, DIST_OLD_FOLDER),
    );
    if (!renameResult.ok) {
      // Exit if there was an error renaming the `dist` folder
      console.error(
        `❌ There was an error renaming the \`${DIST_FOLDER}\` folder. Build cancelled. Please check the error and retry.`,
      );
      console.error(renameResult.error);
      process.exitCode = 1;
      return;
    }
  }

  // Bundle the `dist-tmp` folder
  try {
    await tsupBuild({
      entry: [DIST_TMP_FOLDER_FOR_BUNDLE],
      dts: true,
      format: ["cjs", "esm"],
      publicDir: DIST_TMP_FOLDER_JSON,
    });
    // Remove the `dist-tmp` folder
    await fs.rm(DIST_TMP_FOLDER, { recursive: true }).catch((e) => {
      console.warn(
        `⚠️ There was an error removing the \`${DIST_TMP_FOLDER}\` folder. Please remove it manually.`,
      );
      console.warn(e);
    });
    // Remove the old `dist` folder if it exists
    if (hasDistFolder) {
      await fs.rm(DIST_OLD_FOLDER, { recursive: true }).catch((e) => {
        console.warn(
          `⚠️ There was an error removing the old \`${DIST_FOLDER}\` folder. Please remove it manually.`,
        );
        console.warn(e);
      });
    }
    console.log("\n✅ Build for the exposed ABIs is successful.\n");
  } catch (err) {
    // If there was an error, remove the `dist-tmp` folder, remove the new `dist` folder if it exists, and rename the old `dist` folder back to `dist`
    const hasDistTmpFolder = await fs.stat(DIST_TMP_FOLDER).catch(() => false);
    if (hasDistTmpFolder) {
      await fs.rm(DIST_TMP_FOLDER, { recursive: true }).catch((e) => {
        console.warn(
          `⚠️ There was an error removing the \`${DIST_TMP_FOLDER}\` folder. Please remove it manually.`,
        );
        console.warn(e);
      });
    }
    const hasDistFolder = await fs.stat(DIST_FOLDER).catch(() => false);
    if (hasDistFolder) {
      await fs.rm(DIST_FOLDER, { recursive: true }).catch((e) => {
        console.warn(
          `⚠️ There was an error removing the new \`${DIST_FOLDER}\` folder. Please remove it manually.`,
        );
        console.warn(e);
      });
    }
    const hasDistOldFolder = await fs.stat(DIST_OLD_FOLDER).catch(() => false);
    if (hasDistOldFolder) {
      fs.rename(DIST_OLD_FOLDER, DIST_FOLDER).catch((e) => {
        console.warn(
          `⚠️ There was an error renaming the \`${DIST_OLD_FOLDER}\` folder back to \`${DIST_FOLDER}\`. Please rename it manually.`,
        );
        console.warn(e);
      });
    }
    console.error(
      `❌ There was an error filling the new \`${DIST_FOLDER}\` folder. Build cancelled. Please check the error and retry.`,
    );
    console.error(err);
    process.exitCode = 1;
    return;
  }
}

path.join;
path.resolve;

/**
 * Fills the `dist-tmp` folder with the ABI of the contracts at each version.
 * Only the contracts that have a version file in the generated delta artifacts folder will be included.
 * @dev Error handling is not done in this function. It is assumed that the caller will handle errors.
 */
async function fillDistTmpFolder() {
  // Create the `dist-tmp/for-bundle` and the `dist-tmp/json` folders
  await fs.mkdir(DIST_TMP_FOLDER_FOR_BUNDLE);
  await fs.mkdir(DIST_TMP_FOLDER_JSON);
  const entries = await fs.readdir(GENERATED_DELTA_CONTRACTS_ARTIFACTS_FOLDER, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    // Only repositories are expected
    if (entry.isDirectory()) {
      // Create the contract folder for the bundle and the json
      const contractName = entry.name;
      await fs.mkdir(path.join(DIST_TMP_FOLDER_FOR_BUNDLE, contractName));
      await fs.mkdir(path.join(DIST_TMP_FOLDER_JSON, contractName));
      // For each version,
      //  1. Create a <version>.json file
      //  2. Create a <version>.ts file
      for await (const { version, abi } of lookForContractAbiVersions(
        contractName,
      )) {
        await fs.writeFile(
          path.join(DIST_TMP_FOLDER_JSON, contractName, `${version}.json`),
          abi,
        );
        await fs.writeFile(
          path.join(DIST_TMP_FOLDER_FOR_BUNDLE, contractName, `${version}.ts`),
          `export const abi = ${abi} as const;`,
        );
      }
    }
  }
}

/**
 * Async generator that yields the versions and ABIs of a contract.
 * @dev Error handling is not done in this function. It is assumed that the caller will handle errors.
 * @dev Only the json files are expected and handled.
 * @dev It is assumed that the file content is a JSON object with an `abi` property.
 * @param contractName Name of the contract
 * @yields The version and ABI of the contract
 */
async function* lookForContractAbiVersions(
  contractName: string,
): AsyncGenerator<{ version: string; abi: string }> {
  const contractPath = path.join(
    GENERATED_DELTA_CONTRACTS_ARTIFACTS_FOLDER,
    contractName,
  );
  const entries = await fs.readdir(contractPath, { withFileTypes: true });
  for (const entry of entries) {
    // Only files are expected
    if (entry.isFile()) {
      // Check if the file is a version file of the form `<name>.json`
      const versionName = entry.name.endsWith(".json")
        ? entry.name.slice(0, -5)
        : undefined;

      if (versionName) {
        const fileContent = await fs.readFile(
          path.join(contractPath, entry.name),
          "utf-8",
        );
        // file content is expected to be a JSON object with a `abi` property
        const abi = JSON.parse(fileContent).abi;
        if (abi) {
          yield { version: versionName, abi: JSON.stringify(abi, null, 4) };
        }
      }
    }
  }
}

build();
