import fs from "fs/promises";
import getReleasePlan from "@changesets/get-release-plan";
import { findLastRelease, semverStringToSemver, toResult } from "./utils";

/**
 * Copy the compilation artifacts from `releases/tmp` to `releases/<release name>`.
 *
 * This script must be run after at least one changeset for the new release has been added. Use `yarn changeset` to add a changeset.
 * This script must be run after an isolated hardhat compilation using the `hardhat.config.release.ts` config file.
 *
 * The release name is retrieved from the changeset version.
 *
 * If there are no previous releases, it will create the first release by copying the `releases/tmp` folder to `releases/<release name>`,
 * The next release is created by copying the `releases/tmp` folder to `releases/<release name>`,
 *
 * @dev Assumptions:
 * - The `releases/tmp` contains the artifacts of the current release, it must have been created by a Hardhat compilation. See below for the exact expected structure.
 * - The `releases/generated-delta` folder may exist, if it does, it contains the generated delta artifacts. Ignored in this script.
 *
 * @dev The `releases/tmp` folder has the following expected structure:
 * ```
 * releases/tmp
 * └── artifacts
 *   ├── build-info
 *   │   └── <build info file name>.json
 *   └── src
 *      ├── <contract-name>.sol
 *      │   └── <contract-name>.dbg.json
 *      │   └── <contract-name>.json
 *      └── ...
 * ```
 *
 * @dev The `releases` folder will have the following structure after the script has run:
 * ```
 * releases
 * ├── generated-delta // Ignored in this script
 * ├── <release-name a>
 * │   └── artifacts
 * │       ├── build-info
 * │       │   └── <build info file name>.json
 * │       └── src
 * │           ├── <contract-name>.sol
 * │           │   └── <contract-name>.dbg.json
 * │           │   └── <contract-name>.json
 * │           └── ...
 * └── <release-name b>
 *     └── artifacts
 *         ├── build-info
 *         │   └── <build info file name>.json
 *         └── src
 *             ├── <contract-name>.sol
 *             │   └── <contract-name>.dbg.json
 *             │   └── <contract-name>.json
 *             └── ...
 *
 */
async function copyNewReleaseCompilation() {
  const hasReleasesFolder = await fs.stat("./releases").catch(() => false);
  if (!hasReleasesFolder) {
    // Exit if there are no releases
    console.error(
      "❌ Releases folder has not been found at `./releases`. It should either alreay exist, or have been previously created by the hardhat compilation.",
    );
    process.exitCode = 1;
    return;
  }

  const hasTmpFolder = await fs.stat("./releases/tmp").catch(() => false);
  if (!hasTmpFolder) {
    // Exit if there are no tmp folder
    console.error(
      "❌ Tmp folder has not been found at `./releases/tmp`. It should have been previously created by the hardhat compilation.",
    );
    process.exitCode = 1;
    return;
  }

  const releasePlan = await getReleasePlan(process.cwd());
  if (releasePlan.releases.length === 0 || releasePlan.releases.length > 1) {
    const text =
      releasePlan.releases.length === 0
        ? "❌ No new release has been prepared. Please make sure to have added a changeset by using `yarn changeset` and try again."
        : "❌ Unexpected error: multiple releases have been prepared. Only one is expected. Please check the release plan and try again.";
    console.error(text);
    await fs.rm("./releases/tmp", { recursive: true }).catch(() => {
      console.warn(
        `⚠️ An error occured while deleting the \`./releases/tmp\` folder. Please delete it manually and try again.`,
      );
    });
    process.exitCode = 1;
    return;
  }

  const newReleaseVersion = `v${releasePlan.releases[0].newVersion}`;
  // Verify that the new release version is valid semver
  if (!/^v\d+\.\d+\.\d+$/.test(newReleaseVersion)) {
    console.error(
      `❌ Unexpected error: the new release version ${newReleaseVersion} is not a valid semver. Please check the release plan and try again.`,
    );
    await fs.rm("./releases/tmp", { recursive: true }).catch(() => {
      console.warn(
        `⚠️ An error occured while deleting the \`./releases/tmp\` folder. Please delete it manually and try again.`,
      );
    });
    process.exitCode = 1;
    return;
  }

  // Check if there are previous releases by retrieving all the folders in `./releases` folder
  // and filter out the `tmp`, `generated-delta` and `snapshots` folders
  const previousReleases = await fs
    .readdir("./releases")
    .then((releases) =>
      releases.filter(
        (r) => !["tmp", "generated-delta", "snapshots"].includes(r),
      ),
    );
  if (previousReleases.length === 0) {
    // If there are no previous releases
    // We rename the `./releases/tmp` to `./releases/${newReleaseVersion}`
    const renameResult = await toResult(
      fs.rename("./releases/tmp", `./releases/${newReleaseVersion}`),
    );
    if (!renameResult.ok) {
      console.error(
        "❌ An error occured while creating the first release. The `./releases` folder will be deleted. Please check the error below and try again.",
      );
      console.error(renameResult.error);
      await fs.rm("./releases", { recursive: true }).catch(() => {
        console.warn(
          "⚠️ An error occured while deleting the `./releases` folder. Please delete it manually and try again.",
        );
      });
      process.exitCode = 1;
      return;
    }
    console.log(
      `✅ The next release ${newReleaseVersion} has been created. You can now run \`yarn release:generate-delta && yarn build\` to generate the artifacts to be distributed.`,
    );
  } else {
    // 1. we verify that the release names are valid semver
    const invalidReleases = previousReleases.filter(
      (r) => !/^v\d+\.\d+\.\d+$/.test(r),
    );
    if (invalidReleases.length > 0) {
      console.error(`❌ Invalid release names have been found. They should be valid semver.
            The \`./releases/tmp\` folder will be deleted. Please inspect or delete manually the invalid releases and try again.
            Invalid releases: ${invalidReleases.join(", ")}`);
      await fs.rm("./releases/tmp", { recursive: true }).catch(() => {
        console.warn(
          `⚠️ An error occured while deleting the \`./releases/tmp\` folder. Please delete it manually and try again.`,
        );
      });
      process.exitCode = 1;
      return;
    }
    // 2. we verify that the last release is before the new release
    const lastRelease = findLastRelease(previousReleases);
    const newReleaseSemver = semverStringToSemver(newReleaseVersion);
    if (
      lastRelease.semver.major > newReleaseSemver.major ||
      (lastRelease.semver.major === newReleaseSemver.major &&
        lastRelease.semver.minor > newReleaseSemver.minor) ||
      (lastRelease.semver.major === newReleaseSemver.major &&
        lastRelease.semver.minor === newReleaseSemver.minor &&
        lastRelease.semver.patch > newReleaseSemver.patch)
    ) {
      console.error(
        `❌ The new release ${newReleaseVersion} is not after the last release ${lastRelease.name}. Please check the release plan and try again.`,
      );
      await fs.rm("./releases/tmp", { recursive: true }).catch(() => {
        console.warn(
          `⚠️ An error occured while deleting the \`./releases/tmp\` folder. Please delete it manually and try again.`,
        );
      });
      process.exitCode = 1;
      return;
    }
    // 2. we rename the `./releases/tmp` to `./releases/${newReleaseVersion}`
    const renameResult = await toResult(
      fs.rename("./releases/tmp", `./releases/${newReleaseVersion}`),
    );
    if (!renameResult.ok) {
      console.error(
        `❌ An error occured while creating the next release. The \`./releases/tmp\` folder will be deleted. Please check the error below and try again.`,
      );
      console.error(renameResult.error);
      await fs.rm("./releases/tmp", { recursive: true }).catch(() => {
        console.warn(
          `⚠️ An error occured while deleting the \`./releases/tmp\` folder. Please delete it manually and try again.`,
        );
      });
      process.exitCode = 1;
      return;
    }
    console.log(
      `✅ The next release ${newReleaseVersion} has been created. You can now run \`yarn release:generate-delta && yarn build\` to generate the artifacts to be distributed.`,
    );
  }
}

copyNewReleaseCompilation();
