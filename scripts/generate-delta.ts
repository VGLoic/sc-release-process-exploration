import fs from 'fs/promises';
import { findLastRelease, semverStringToSemver, toResult } from './utils';

/**
 * Generate the delta artifacts based on the existing releases
 * This script must be run once the `releases` folder has been populated with at least one release.
 * 
 * If there are no previous releases, it will exit.
 * If there is only one release, it will initialize the `generated-delta` folder and populate it with the artifacts.
 * If there are multiple releases, it will compare the current artifacts with the previous ones and generate the delta artifacts for each successive release.
 * 
 * If existing delta artifacts are found, they are moved to `generated-delta-old` folder during the new generation.
 * If an error occurs during the generation, the new `generated-delta` folder is removed and the old one is renamed back to `generated-delta`.
 * 
 * @dev Assumptions:
 * - The `releases` folder exists and contains the releases of the contracts. It follows the form specified in `prepare-release.ts`.
 * 
 * @dev The `generated-delta` folder has the following structure:
 * ```
 * generated-delta
 * ├── artifacts
 * │   ├── <contract-name>
 * │   │   ├── <release-name a>.json
 * │   │   ├── <release-name b>.json
 * │   │   └── ...
 * │   └── ...
 * └── build-infos
 *   ├── <release-name a>.json
 *   ├── <release-name b>.json
 *   └── ...
 * ```
 */
async function generateDelta() {
    const hasReleasesFolder = await fs.stat('./releases').catch(() => false);
    if (!hasReleasesFolder) {
        // Exit if there are no releases
        console.error('❌ Releases folder has not been found at `./releases`. It needs to exist to generate the delta between each releases.')
        process.exitCode = 1;
        return;
    }

    // We retrieve the list of releases
    const previousReleases = await fs.readdir('./releases').then(releases => releases.filter(r => !['tmp', 'generated-delta'].includes(r)));
    if (previousReleases.length === 0) {
        // Exit if there are no releases
        console.error('❌ There are no releases to generate delta from. It needs at least one release to initiate the deltas.');
        process.exitCode = 1;
        return;
    }

    // We check for invalid release names
    const invalidReleases = previousReleases.filter(r => !/^v\d+\.\d+\.\d+$/.test(r));
    if (invalidReleases.length > 0) {
        console.error(`❌ Invalid release names have been found. They should be valid semver.
        Please inspect or delete manually the invalid releases and try again.
        Invalid releases: ${invalidReleases.join(', ')}`);
        process.exitCode = 1;
        return;
    }

    // If `generated-delta` folder exists
    // Remove the current `generated-delta-old` folder
    // Rename the current `generated-delta` folder to `generated-delta-old`
    const hasGeneratedDeltaFolder = await fs.stat('./releases/generated-delta').catch(() => false);
    if (hasGeneratedDeltaFolder) {
        const hasGeneratedDeltaOldFolder = await fs.stat('./releases/generated-delta-old').catch(() => false);
        if (hasGeneratedDeltaOldFolder) {
            const removeDeltaOldResult = await toResult(fs.rm('./releases/generated-delta-old', { recursive: true }));
            if (!removeDeltaOldResult.ok) {
                // Exit if there was an error removing the `generated-delta-old` folder
                console.error('❌ There was an error removing the `./releases/generated-delta-old` folder. Please remove it manually. Generation cancelled.');
                console.error(removeDeltaOldResult.error);
                process.exitCode = 1;
                return;
            }
        }
        const renameResult = await toResult(fs.rename('./releases/generated-delta', './releases/generated-delta-old'));
        if (!renameResult.ok) {
            // Exit if there was an error renaming the `generated-delta` folder
            console.error('❌ There was an error renaming the `./releases/generated-delta` folder. Generation cancelled. Please check the error and retry.');
            console.error(renameResult.error);
            process.exitCode = 1;
            return;
        }
    }

    // Create the new `generated-delta` folder
    const createGeneratedDeltaResult = await toResult(fs.mkdir('./releases/generated-delta'));
    if (!createGeneratedDeltaResult.ok) {
        // Exit if there was an error creating the `generated-delta` folder
        console.error('❌ There was an error creating the new `./releases/generated-delta` folder. Generation cancelled. Please check the error and retry.');
        console.error(createGeneratedDeltaResult.error);
        process.exitCode = 1;
        return;
    }

    // We order the releases by version, we start with the oldest
    const orderedReleases = previousReleases.sort((a, b) => {
        const semverA = semverStringToSemver(a);
        const semverB = semverStringToSemver(b);
        if (semverA.major !== semverB.major) {
            return semverA.major - semverB.major;
        }
        if (semverA.minor !== semverB.minor) {
            return semverA.minor - semverB.minor;
        }
        return semverA.patch - semverB.patch;
    });

    try {
        // The first release is the oldest and is used for the first delta
        const firstRelease = orderedReleases[0];
        // We initialize the generated delta folder
        await initGeneratedFiles(firstRelease);
    
        // We iterate over each release
        for (let i = 1; i < orderedReleases.length; i++) {
            const release = orderedReleases[i];
            // We compare the current release with the previous one
            await compareAndGenerate(release);
        }

        // Remove the old `generated-delta` folder if it exists
        if (hasGeneratedDeltaFolder) {
            await fs.rm('./releases/generated-delta-old', { recursive: true }).catch(() => {
                console.error('❌ There was an error removing the `generated-delta-old` folder. Please remove it manually.');
            });
        }

        console.log('✅ Delta generation completed.');
    } catch (err) {
        // If there was an error, remove the new `generated-delta` folder and rename the potential old one back
        await fs.rm('./releases/generated-delta', { recursive: true }).catch((e) => {
            console.error('❌ There was an error removing the new `./releases/generated-delta` folder. Please remove it manually.');
            console.error(e);
        });
        const hasGeneratedDeltaOldFolder = await fs.stat('./releases/generated-delta-old').catch(() => false);
        if (hasGeneratedDeltaOldFolder) {
            fs.rename('./releases/generated-delta-old', './releases/generated-delta').catch(e => {
                console.error('❌ There was an error renaming the `./releases/generated-delta-old` folder back to `./releases/generated-delta`. Please rename it manually.');
                console.error(e);
            });
        }
        throw err;
    }
}


/**
 * Initialize the generated delta folder
 * This function is called when we deal with the first release
 * It copies the build info file and the contract artifacts to the generated delta folder
 * The generated delta artifacts are in the form `releases/generated-delta/artifacts/<contract-name>/<release-name>.json`.
 * @dev Assumptions:
 * - The `releases/${releaseName}/artifacts/build-info` folder exists and contains the build info file.
 * - The `releases/${releaseName}/artifacts/src` folder exists and contains the contract artifacts.
 * @param releaseName Name of the first release
 * 
 * The `generated-delta` folder has the general form as below. At the initialization, one should consider only one release.
 * ```
 * generated-delta
 * ├── artifacts
 * │   ├── <contract-name>
 * │   │   ├── <release-name>.json
 * │   │   └── ...
 * │   └── ...
 * └── build-infos
 *    ├── <release-name>.json
 *    └── ...
 * ```
 */
async function initGeneratedFiles(releaseName: string) {
    // Create `releases/generated-delta/build-infos` folder
    await fs.mkdir('./releases/generated-delta/build-infos');
    // Copy `releases/${releaseName}/artifacts/build-info/<build info file name>.json` to `releases/generated-delta/build-infos/${releaseName}.json`
    const buildInfoFileName = (await fs.readdir(`./releases/${releaseName}/artifacts/build-info`))[0];
    await fs.copyFile(`./releases/${releaseName}/artifacts/build-info/${buildInfoFileName}`, `./releases/generated-delta/build-infos/${releaseName}.json`);

    // Create `releases/generated-delta/artifacts` folder
    await fs.mkdir('./releases/generated-delta/artifacts');
    // Recursively read `releases/${releaseName}/artifacts/src`
    // Iterate over each contract artifact
    for await (const entry of lookForContractArtifact(`./releases/${releaseName}/artifacts/src`)) {
        // Create releases/generated-delta/artifacts/${contractName} folder
        await fs.mkdir(`./releases/generated-delta/artifacts/${entry.contractName}`);
        // Copy `releases/${releaseName}/hardhat-output/artifacts/src/${contractName}.sol/${contractName}.json` to `releases/generated-delta/artifacts/${contractName}/${releaseName}.json`
        await fs.copyFile(entry.filePath, `./releases/generated-delta/artifacts/${entry.contractName}/${releaseName}.json`);
    }
}

/**
 * Compare the current artifacts with the previous ones and generate the delta artifacts
 * This function is called when we deal with a release that is not the first one
 * It compares the current artifacts with the previous ones and generates the delta artifacts
 * If the current artifact is different from the previous one based on the bytecode, the current artifact is copied to the generated delta folder.
 * If the current artifact is the same as the previous one, no delta artifact is generated.
 * The generated delta artifacts are in the form `releases/generated-delta/artifacts/<contract-name>/<release-name>.json`.
 * 
 * If the release is empty, a warning message will be sent.
 * 
 * This method bubbles up the error to the caller.
 * 
 * @dev Assumptions:
 * - The `releases/${releaseName}/artifacts/build-info` folder exists and contains the build info file.
 * - The `releases/${releaseName}/artifacts/src` folder exists and contains the contract artifacts.
 * - The contract artifacts are JSON files with an `bytecode` property.
 * - The `releases/generated-delta` folder already exists and contains the generated delta artifacts with the previous releases.
 * - The previously generated delta artifacts are in the form `releases/generated-delta/artifacts/<contract-name>/<release-name>.json`.
 * 
 * @param releaseName Name of the release
 * 
 * The `generated-delta` folder has the general form as below. At the initialization, one should consider only one release.
 * ```
 * generated-delta
 * ├── artifacts
 * │   ├── <contract-name>
 * │   │   ├── <release-name a>.json
 * │   │   ├── <release-name b>.json
 * │   │   └── ...
 * │   └── ...
 * └── build-infos
 *    ├── <release-name a>.json
 *    ├── <release-name b>.json
 *    └── ...
 * ```
 */
async function compareAndGenerate(releaseName: string) {
    // We keep track of the created files and folders, in order to delete them if an error occurs
    let createdFiles = [];
    let createdFolders = [];

    // Copy `releases/${releaseName}/artifacts/build-info/<build info file name>.json` to `releases/generated-delta/build-infos/${releaseName}.json`
    const buildInfoFileName = (await fs.readdir(`./releases/${releaseName}/artifacts/build-info`))[0];
    await fs.copyFile(`./releases/${releaseName}/artifacts/build-info/${buildInfoFileName}`, `./releases/generated-delta/build-infos/${releaseName}.json`);
    createdFiles.push(`./releases/generated-delta/build-infos/${releaseName}.json`);

    // Recursively read releases/${releaseName}/artifacts/src
    // Iterate over each contract artifact and compare it with the previous release
    for await (const entry of lookForContractArtifact(`./releases/${releaseName}/artifacts/src`)) {
        // Check if a generated contract folder exists already and retrieve the previous releases
        const previousReleases = await fs.readdir(`./releases/generated-delta/artifacts/${entry.contractName}`).catch(() => [] as string[]);
        // If there are no previous releases, create the folder and copy the artifact
        if (previousReleases.length === 0) {
            await fs.mkdir(`./releases/generated-delta/artifacts/${entry.contractName}`);
            createdFolders.push(`./releases/generated-delta/artifacts/${entry.contractName}`);
            await fs.copyFile(entry.filePath, `./releases/generated-delta/artifacts/${entry.contractName}/${releaseName}.json`);
        }
        // If there are previous releases, compare the current artifact with the previous one
        else {
            // Find the last release, the `.json` extension is removed
            const lastRelease = findLastRelease(previousReleases.map(r => r.slice(0, -5)));
            // Read the artifact of the last release
            const lastReleaseArtifact = await fs.readFile(`./releases/generated-delta/artifacts/${entry.contractName}/${lastRelease.name}.json`, 'utf-8');
            // Read the artifact of the current release
            const currentReleaseArtifact = await fs.readFile(entry.filePath, 'utf-8');
            // Compare the bytecode of the last release with the current one
            const lastReleaseArtifactJson = JSON.parse(lastReleaseArtifact);
            const currentReleaseArtifactJson = JSON.parse(currentReleaseArtifact);
            if (lastReleaseArtifactJson.bytecode !== currentReleaseArtifactJson.bytecode) {
                // If the bytecode is different, copy the artifact to the current release folder
                await fs.copyFile(entry.filePath, `./releases/generated-delta/artifacts/${entry.contractName}/${releaseName}.json`);
                createdFiles.push(`./releases/generated-delta/artifacts/${entry.contractName}/${releaseName}.json`);
            }
        }
    }

    if (createdFiles.length === 1 && createdFolders.length === 0) {
        // If no files or folders have been created, we throw an error
        console.warn(`Only build infos have been created. It looks like the release ${releaseName} is empty.`);
    }
}

/**
 * Look for contract artifacts in a directory
 * We iterate over each directory and check if it's a contract artifact
 * If it is, we yield it
 * If it's not, we recursively call this function on the directory
 * A contract artifact is detected when a directory ends with .sol
 * This is only true for Hardhat artifacts
 * @param dir Directory to look for contract artifacts
 */
async function* lookForContractArtifact(dir: string): AsyncGenerator<{ contractName: string; filePath: string }> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (entry.name.endsWith('.sol')) {
                // Remove the .sol extension
                const contractName = entry.name.slice(0, -4);
                yield { contractName, filePath: `${dir}/${entry.name}/${contractName}.json` } ;
            } else {
                yield* lookForContractArtifact(`${dir}/${entry.name}`);
            }
        }
    }
}

generateDelta();
