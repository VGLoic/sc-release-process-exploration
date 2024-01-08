import fs from "fs/promises";
import { toResult } from "./utils";

async function copyDistToAbis() {
  // Check that `dist` folder exists
  const hasDistFolder = await fs.stat("./dist").catch(() => false);
  if (!hasDistFolder) {
    // Exit if there are no dist folder
    console.error(
      "❌ Dist folder has not been found at `./dist`. It should have been previously created by the hardhat compilation.",
    );
    process.exitCode = 1;
    return;
  }

  // Remove `abis` folder if it exists
  const hasAbisFolder = await fs.stat("./abis").catch(() => false);
  if (hasAbisFolder) {
    const removeResult = await toResult(fs.rm("./abis", { recursive: true }));
    if (!removeResult.ok) {
      console.error(
        "❌ An error occurred while removing the `./abis` folder.",
        removeResult.error,
      );
      process.exitCode = 1;
      return;
    }
  }

  // Create `abis` folder
  const mkdirResult = await toResult(fs.mkdir("./abis"));
  if (!mkdirResult.ok) {
    console.error(
      "❌ An error occurred while creating the `./abis` folder.",
      mkdirResult.error,
    );
    process.exitCode = 1;
    return;
  }

  // Copy `dist` folder content into `abis` folder
  const copyResult = await toResult(
    fs.cp("./dist", "./abis", { recursive: true }),
  );
  if (!copyResult.ok) {
    console.error(
      "❌ An error occurred while copying the `./dist` folder into `./abis`.",
      copyResult.error,
    );
    process.exitCode = 1;
    return;
  }

  console.log("✅ Successfully copied `./dist` into `./abis`.");
}

copyDistToAbis();
