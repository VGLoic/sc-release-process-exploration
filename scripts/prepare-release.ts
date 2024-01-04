import fs from 'fs/promises';
import { findLastRelease, toResult } from './utils';

/**
 * Prepare the next release
 * This script must be run after an isolated hardhat compilation using the `hardhat.config.release.ts` config file.
 * 
 * If there are no previous releases, it will create the first release by copying the `releases/tmp` folder to `releases/v1.0.0`,
 * 
 * If there are previous releases, it will create the next release.
 * The next release name is derived from the last release by incrementing the minor version.
 * The next release is created by copying the `releases/tmp` folder to `releases/<next release name>`,
 * 
 * @dev Assumptions:
 * - The `releases` folder exists,
 * - The `releases/tmp` folder exists and contains the artifacts of the current release, it must have been created by a Hardhat compilation. See below for the exact expected structure.
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
async function prepareRelease() {
    const hasReleasesFolder = await fs.stat('./releases').catch(() => false);
    if (!hasReleasesFolder) {
        // Exit if there are no releases
        console.error('❌ Releases folder has not been found at `./releases`. It should either alreay exist, or have been previously created by the hardhat compilation.')
        process.exitCode = 1;
        return;
    }

    const hasTmpFolder = await fs.stat('./releases/tmp').catch(() => false);
    if (!hasTmpFolder) {
        // Exit if there are no tmp folder
        console.error('❌ Tmp folder has not been found at `./releases/tmp`. It should have been previously created by the hardhat compilation.')
        process.exitCode = 1;
        return;
    }

    // Check if there are previous releases by retrieving all the folders in `./releases` folder
    // and filter out the `tmp` and `generated-delta` folders
    const previousReleases = await fs.readdir('./releases').then(releases => releases.filter(r => !['tmp', 'generated-delta'].includes(r)));
    if (previousReleases.length === 0) {
        const INITIAL_RELEASE_NAME = 'v1.0.0';
        try {
            // If there are no previous releases
            // We rename the `./releases/tmp` to `./releases/${INITIAL_RELEASE_NAME}`
            await fs.rename('./releases/tmp', `./releases/${INITIAL_RELEASE_NAME}`);
            console.log(`✅ The first release ${INITIAL_RELEASE_NAME} has been created. You can now run \`yarn build\` to generate the artifacts to be distributed.`)
        } catch (err) {
            console.error('❌ An error occured while creating the first release. The `./releases` folder will be deleted. Please check the error below and try again.')
            console.error(err);
            await fs.rm('./releases', { recursive: true }).catch(() => {
                console.error('❌ An error occured while deleting the `./releases` folder. Please delete it manually and try again.')
            });
            process.exitCode = 1;
            return;
        }
    } else {
        // 1. we verify that the release names are valid semver
        const invalidReleases = previousReleases.filter(r => !/^v\d+\.\d+\.\d+$/.test(r));
        if (invalidReleases.length > 0) {
            console.error(`❌ Invalid release names have been found. They should be valid semver.
            The \`./releases/tmp\` folder will be deleted. Please inspect or delete manually the invalid releases and try again.
            Invalid releases: ${invalidReleases.join(', ')}`);
            await fs.rm('./releases/tmp', { recursive: true });
            process.exitCode = 1;
            return;
        }
        // 2. we obtain the last release
        const lastRelease = findLastRelease(previousReleases);
        // 3. we derive the next release name by incrementing the minor version
        const nextReleaseName = `v${lastRelease.semver.major}.${lastRelease.semver.minor + 1}.${lastRelease.semver.patch}`;
        // 4. we rename the `./releases/tmp` to `./releases/${nextReleaseName}`
        const renameResult = await toResult(fs.rename('./releases/tmp', `./releases/${nextReleaseName}`));
        if (!renameResult.ok) {
            console.error(`❌ An error occured while creating the next release. The \`./releases/tmp\` folder will be deleted. Please check the error below and try again.`)
            console.error(renameResult.error);
            await fs.rm('./releases/tmp', { recursive: true }).catch(() => {
                console.error(`❌ An error occured while deleting the \`./releases/tmp\` folder. Please delete it manually and try again.`)
            });
            process.exitCode = 1;
            return;
        }
        console.log(`✅ The next release ${nextReleaseName} has been created. You can now run \`yarn release:generate-delta && yarn build\` to generate the artifacts to be distributed.`)
    }
}

prepareRelease();
