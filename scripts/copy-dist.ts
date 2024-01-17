import fs from "fs/promises";
import { toResult } from "./utils";
import path from "node:path";
import { DIST_FOLDER } from "./constants";

// Exposed `abis` folder
const ABIS_FOLDER = path.join(__dirname, "../../abis");

async function copyDistToAbis() {
  // Check that `dist` folder exists
  const hasDistFolder = await fs.stat(DIST_FOLDER).catch(() => false);
  if (!hasDistFolder) {
    // Exit if there are no dist folder
    console.error(
      `❌ Dist folder has not been found at \`${DIST_FOLDER}\`. It should have been previously created by the hardhat compilation.`,
    );
    process.exitCode = 1;
    return;
  }

  // Remove `abis` folder if it exists
  const hasAbisFolder = await fs.stat(ABIS_FOLDER).catch(() => false);
  if (hasAbisFolder) {
    const removeResult = await toResult(
      fs.rm(ABIS_FOLDER, { recursive: true }),
    );
    if (!removeResult.ok) {
      console.error(
        `❌ An error occurred while removing the \`${ABIS_FOLDER}\` folder.`,
        removeResult.error,
      );
      process.exitCode = 1;
      return;
    }
  }

  // Create `abis` folder
  const mkdirResult = await toResult(fs.mkdir(ABIS_FOLDER));
  if (!mkdirResult.ok) {
    console.error(
      `❌ An error occurred while creating the \`${ABIS_FOLDER}\` folder.`,
      mkdirResult.error,
    );
    process.exitCode = 1;
    return;
  }

  // Copy `dist` folder content into `abis` folder
  const copyResult = await toResult(
    fs.cp(DIST_FOLDER, ABIS_FOLDER, { recursive: true }),
  );
  if (!copyResult.ok) {
    console.error(
      `❌ An error occurred while copying the \`${DIST_FOLDER}\` folder into \`${ABIS_FOLDER}\`.`,
      copyResult.error,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n✅ Successfully copied \`${DIST_FOLDER}\` into \`${ABIS_FOLDER}\` for release.\n`,
  );
}

copyDistToAbis();
