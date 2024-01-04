import fs from 'fs/promises';

/**
 * Prepare the next release
 * This script must be run after an isolated hardhat compilation using the `hardhat.config.release.ts` config file.
 * 
 * If there are no previous releases, it will create the first release by
 *  1. copying the `releases/tmp` folder to `releases/v1.0.0`,
 *  2. initializing the `releases/generated-delta` folder.
 * 
 * If there are previous releases, it will create the next release.
 * The next release name is derived from the last release by incrementing the minor version.
 * The next release is created by
 * 1. copying the `releases/tmp` folder to `releases/<next release name>`,
 * 2. comparing the current artifacts with the previous ones and generating the delta artifacts.
 * 
 * @dev Assumptions:
 * - The `releases` folder exists,
 * - The `releases/tmp` folder exists and contains the artifacts of the current release, it must have been created by a Hardhat compilation. See below for the exact expected structure.
 * - The `releases/generated-delta` folder may exist, if it does, it contains the generated delta artifacts. See below for the exact structure.
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
 * @dev The `releases/generated-delta` folder has the following structure:
 * ```
 * releases/generated-delta
 * ├── build-infos
 * │   ├── <version a>.json
 * │   └── <version b>.json
 * └── artifacts
 *    ├── <contract-name>
*     │   ├── <version a>.json
 *    │   └── <version b>.json
 *    └── ...
 * ```
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
            // 1. we rename the `./releases/tmp` to `./releases/${INITIAL_RELEASE_NAME}`
            await fs.rename('./releases/tmp', `./releases/${INITIAL_RELEASE_NAME}`);
            // 3. we initialize the `./releases/generated-delta` folder
            await initGeneratedFiles(INITIAL_RELEASE_NAME);
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
        await fs.rename('./releases/tmp', `./releases/${nextReleaseName}`);
        try {
            // 5. we compare the current artifacts with the previous ones
            await compareAndGenerate(nextReleaseName);
            console.log(`✅ The next release ${nextReleaseName} has been created. You can now run \`yarn build\` to generate the artifacts to be distributed.`)
        } catch (err) {
            console.error(`❌ An error occured while creating the next release. The \`./releases/tmp\` and the \`./releases/${nextReleaseName}\` folders will be deleted.
            Please check the error below and try again.`)
            console.error(err);
            await fs.rm(`./releases/${nextReleaseName}`, { recursive: true }).catch(() => {
                console.error(`❌ An error occured while deleting the \`./releases/${nextReleaseName}\` folder. Please delete it manually and try again.`)
            });
            process.exitCode = 1;
            return;
        }
    }
}

/**
 * Initialize the generated files and folders
 * This function is called when the first release is created
 * It copies the build info file and the contract artifacts to the generated delta folder
 * @dev Assumptions:
 * - The `releases/${releaseName}/artifacts/build-info` folder exists and contains the build info file.
 * - The `releases/${releaseName}/artifacts/src` folder exists and contains the contract artifacts.
 * @param releaseName 
 */
async function initGeneratedFiles(releaseName: string) {
    // Delete releases/generated-delta folder if it exists
    const hasGeneratedFolder = await fs.stat('./releases/generated-delta').catch(() => false);
    if (hasGeneratedFolder) {
        await fs.rm('./releases/generated-delta', { recursive: true });
    }
    // Create `releases/generated-delta` folder
    await fs.mkdir('./releases/generated-delta');
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
 * This function is called when the next release is created
 * It compares the current artifacts with the previous ones and generates the delta artifacts
 * If the current artifact is different from the previous one based on the bytecode, the current artifact is copied to the generated delta folder.
 * If the current artifact is the same as the previous one, no delta artifact is generated.
 * The generated delta artifacts are in the form `releases/generated-delta/artifacts/<contract-name>/<release-name>.json`.
 * 
 * In case of error, the created files and folders are deleted.
 * If the release is empty, no files or folders are created and an error is thrown.
 * This method bubbles up the error to the caller.
 * 
 * @dev Assumptions:
 * - The `releases/${releaseName}/artifacts/build-info` folder exists and contains the build info file.
 * - The `releases/${releaseName}/artifacts/src` folder exists and contains the contract artifacts.
 * - The contract artifacts are JSON files with an `bytecode` property.
 * - The `releases/generated-delta` folder exists and contains the generated delta artifacts.
 * - The generated delta artifacts are in the form `releases/generated-delta/artifacts/<contract-name>/<release-name>.json`.
 * 
 * @param releaseName 
 */
async function compareAndGenerate(releaseName: string) {
    // We keep track of the created files and folders, in order to delete them if an error occurs
    let createdFiles = [];
    let createdFolders = [];

    try {
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
            throw new Error(`No files or folders have been created. It looks like this release is empty. Please check that changes are here and try again.`);
        }
    } catch(err) {
        // If an error occurs, delete the created files and folders
        for (const file of createdFiles) {
            await fs.rm(file).catch(e => {
                console.error(`❌ An error occured while deleting the file ${file}. Please delete it manually and try again.`)
                console.error(e);
            });
        }
        for (const folder of createdFolders) {
            await fs.rm(folder, { recursive: true }).catch(e => {
                console.error(`❌ An error occured while deleting the folder ${folder}. Please delete it manually and try again.`)
                console.error(e);
            });
        }
        throw err;
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

function semverStringToSemver(s: string) {
    if (!/^v\d+\.\d+\.\d+$/.test(s)) {
        throw new Error('Invalid semver string');
    }
    const versions = s.slice(1).split('.').map(n => parseInt(n));
    if (versions.some(n => isNaN(n))) {
        throw new Error('Invalid semver string');
    }

    return { major: versions[0], minor: versions[1], patch: versions[2] };
}

function findLastRelease(releases: string[]) {
    if (releases.some(r => !/^v\d+\.\d+\.\d+$/.test(r))) {
        throw new Error('Invalid release names');
    }
    let lastRelease = {
        name: releases[0],
        semver: semverStringToSemver(releases[0])
    }
    for (let i = 1; i < releases.length; i++) {
        const release = releases[i];
        const semver = semverStringToSemver(release);
        if (semver.major > lastRelease.semver.major) {
            lastRelease = {
                name: release,
                semver
            }
        }
        if (semver.major === lastRelease.semver.major) {
            if (semver.minor > lastRelease.semver.minor) {
                lastRelease = {
                    name: release,
                    semver
                }
            }
            if (semver.minor === lastRelease.semver.minor) {
                if (semver.patch > lastRelease.semver.patch) {
                    lastRelease = {
                        name: release,
                        semver
                    }
                }
            }
        }
    }
    return lastRelease;
}

prepareRelease();
