import fs from 'fs/promises';

/**
 * Based on the releases and generated delta artifacts folders,
 * this script will create a new `dist` folder with the following structure:
 * ```
 * dist
 * ├── <contract-name>
 * │   ├── <version a>.json
 * │   ├── <version a>.ts
 * │   ├── <version b>.json
 * │   └── <version b>.ts
 * └── ...
 * ```
 * The `.json` files will contain the ABI of the contract at the corresponding version.
 * The `.ts` files will contain a `abi` TypeScript `const` with the ABI of the contract at the corresponding version.
 * 
 * During the process, the current `dist` folder will be renamed to `dist-old`.
 * If the process is successful, the `dist-old` folder will be removed.
 * If the process fails, the `dist` folder will be removed and the `dist-old` folder will be renamed back to `dist`.
 * 
 * @dev Assumptions:
 * - The `releases` folder exists and contains the releases of the contracts.
 * - The `releases/generated-delta/artifacts` folder exists and contains the generated delta artifacts.
 * - The generated delta artifacts are in the form `releases/generated-delta/artifacts/<contract-name>/v<Major>.<Minor>.<Patch>.json`.
 * - The generated delta artifacts are JSON files with an `abi` property.
 * - The generated delta artifacts are sorted by contract name, then by version.
 */
async function build() {
    const hasReleasesFolder = await fs.stat('./releases').catch(() => false);
    if (!hasReleasesFolder) {
        // Exit if there are no releases
        console.error('❌ Releases folder has not been found at `./releases`. Build cancelled.');
        process.exitCode = 1;
        return;
    }

    const hasGeneratedDeltaArtifactsFolder = await fs.stat('./releases/generated-delta/artifacts').catch(() => false);
    if (!hasGeneratedDeltaArtifactsFolder) {
        // Exit if there are no generated delta
        console.error('❌ Generated delta artifacts folder has not been found at `./releases/generated-delta/artifacts`. Build cancelled.');
        process.exitCode = 1;
        return;
    }

    // If `dist` folder exists
    // Remove the current `dist-old` folder
    // Rename the current `dist` folder to `dist-old`
    const hasDistFolder = await fs.stat('./dist').catch(() => false);
    if (hasDistFolder) {
        const hasDistOldFolder = await fs.stat('./dist-old').catch(() => false);
        if (hasDistOldFolder) {
            const removeDistOldResult = await toResult(fs.rm('./dist-old', { recursive: true }));
            if (!removeDistOldResult.ok) {
                // Exit if there was an error removing the `dist-old` folder
                console.error('❌ There was an error removing the `dist-old` folder. Please remove it manually. Build cancelled.');
                console.error(removeDistOldResult.error);
                process.exitCode = 1;
                return;
            }
        }
        const renameResult = await toResult(fs.rename('./dist', './dist-old'));
        if (!renameResult.ok) {
            // Exit if there was an error renaming the `dist` folder
            console.error('❌ There was an error renaming the `dist` folder. Build cancelled. Please check the error and retry.');
            console.error(renameResult.error);
            process.exitCode = 1;
            return;
        }
    }

    // Create the new `dist` folder
    const createDistResult = await toResult(fs.mkdir('./dist'));
    if (!createDistResult.ok) {
        // Exit if there was an error creating the `dist` folder
        console.error('❌ There was an error creating the new `dist` folder. Build cancelled. Please check the error and retry.');
        console.error(createDistResult.error);
        process.exitCode = 1;
        return;
    }

    try {
        // Fill the new `dist` folder
        await fillDistFolder();
        // Remove the old `dist` folder if it exists
        if (hasDistFolder) {
            await fs.rm('./dist-old', { recursive: true });
        }
    } catch (err) {
        // If there was an error, remove the new `dist` folder and rename the potential old one back
        await fs.rm('./dist', { recursive: true }).catch((e) => {
            console.error('❌ There was an error removing the new `dist` folder. Please remove it manually.');
            console.error(e);
        });
        const hasDistOldFolder = await fs.stat('./dist-old').catch(() => false);
        if (hasDistOldFolder) {
            fs.rename('./dist-old', './dist').catch(e => {
                console.error('❌ There was an error renaming the `dist-old` folder back to `dist`. Please rename it manually.');
                console.error(e);
            });
        }
        console.error('❌ There was an error filling the new `dist` folder. Build cancelled. Please check the error and retry.');
        console.error(err);
        process.exitCode = 1;
        return;
    }
}

/**
 * Fills the `dist` folder with the ABI of the contracts at each version.
 * Only the contracts that have a version file in the generated delta artifacts folder will be included.
 * @dev Error handling is not done in this function. It is assumed that the caller will handle errors.
 */
async function fillDistFolder() {
    const entries = await fs.readdir('./releases/generated-delta/artifacts', { withFileTypes: true });
    for (const entry of entries) {
        // Only repositories are expected
        if (entry.isDirectory()) {
            // Create the contract folder
            const contractName = entry.name;
            await fs.mkdir(`./dist/${contractName}`);
            // For each version,
            //  1. Create a <version>.json file
            //  2. Create a <version>.ts file
            for await (const { version, abi } of lookForContractAbiVersions(contractName)) {
                await fs.writeFile(`./dist/${contractName}/${version}.json`, abi);
                await fs.writeFile(`./dist/${contractName}/${version}.ts`, `export const abi = ${abi} as const;`);
            }
        }
    }
}

/**
 * Async generator that yields the versions and ABIs of a contract.
 * @dev Error handling is not done in this function. It is assumed that the caller will handle errors.
 * @dev Only the file of format `v<Major>.<Minor>.<Patch>.json` are expected and handled.
 * @dev It is assumed that the file content is a JSON object with an `abi` property.
 * @param contractName Name of the contract
 * @yields The version and ABI of the contract
 */
async function* lookForContractAbiVersions(contractName: string): AsyncGenerator<{ version: string; abi: string }> {
    const entries = await fs.readdir(`./releases/generated-delta/artifacts/${contractName}`, { withFileTypes: true });
    for (const entry of entries) {
        // Only files are expected
        if (entry.isFile()) {
            // Check if the file is a version file of the form `v<Major>.<Minor>.<Patch>.json`
            const match = entry.name.match(/^v(\d+)\.(\d+)\.(\d+)\.json$/);
            if (match) {
                const version = `${match[1]}.${match[2]}.${match[3]}`;
                const fileContent = await fs.readFile(`./releases/generated-delta/artifacts/${contractName}/${entry.name}`, 'utf-8');
                // file content is expected to be a JSON object with a `abi` property
                const abi = JSON.parse(fileContent).abi;
                if (abi) {
                    yield { version, abi: JSON.stringify(abi, null, 4) };
                }
            }
        }
    }
}

type Result<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: Error;
};
/**
 * Converts a promise to a promise of a result.
 * @param promise Promise to convert
 * @returns The result of the promise
 */
function toResult<T>(promise: Promise<T>): Promise<Result<T>> {
    return promise
        .then((data) => ({ ok: true as const, data }))
        .catch((error) => ({ ok: false as const, error }));
}

build()
