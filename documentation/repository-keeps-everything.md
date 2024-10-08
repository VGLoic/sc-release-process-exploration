# The repository keeps everything

In this version, **we commit the release files and the deployments directly in the repository**.

We store the releases artifacts in the `releases` folder which is committed on the `main` branch. Different GitHub workflows will help us having this folder up to date:

- on `push` on `main`: the `latest` release is created or updated,
- on `push` on `tags`: the `<tag>` release is created,
- on `pull request`: nothing is updated but we generate a diff with the current state of the `latest` release.

> [!NOTE]
> We are using [Changesets](https://github.com/changesets/changesets) in order to manage release of the NPM package.
> Because of this, we don't rely on the `push on tags` workflow as this part is automated by Changesets.
> Instead, the `main` workflow executes a particular `release` script that contains the logic to take into account the new release and the build for the NPM package.

Deployments will be stored in the `deployments` folder which is commited on the `main` branch too. Scripts are written in the repository in order to deploy contracts based on the artifacts contained in the `releases` folder.

A NPM package is created in order to share the ABIs and the deployments.

## Workflows

The `main.yml` workflow file contains the heart of the artifacts release process

```yaml
jobs:
  release:
    name: Upload latest release artifacts and release NPM package
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - name: Install dependencies
        run: yarn
      - name: Create artifacts
        run: yarn compile
      - name: Commit release artifacts
        env:
          RELEASE_TAG: latest
        run: |
          build_info_filename=$(ls -AU artifacts/build-info | head -1)
          mkdir -p releases/$RELEASE_TAG
          cp -r artifacts/build-info/$build_info_filename releases/$RELEASE_TAG/build-info.json
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if [[ `git status --porcelain` ]]; then
            git add .
            git commit -m "update latest release artifacts"
            git push
          fi
      - name: Create Release Pull Request or Publish to npm
        id: changesets
        uses: changesets/action@v1
        with:
          # Script to run logic logic before actually publishing
          # This is needed as Changesets won't trigger the tags workflow when a new version is published, so we need to do it manually
          # The steps of the script are:
          # 1. Commit and push the new release,
          # 2. Build the artifacts for the NPM package,
          # 3. Publish the NPM package
          publish: yarn release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

> [!WARNING]
> The custom `release` script has actually not been tested.

The `tags.yaml` worfklow will handle all the other releases and will be quite similar in terms of jobs.

> [!NOTE]
> The `tags.yaml` workflow is actually not used when working with Changesets.
> However, it would still be the recommended way of doing things if one was not interested in the automated part of NPM package with Changeset.

## Deployments

When dealing with a list of releases, deployments must take into account which release we're considering. For each release, only a set of contracts is available.

As we can't rely on the usual integration of Hardhat or `hardhat-deploy`, helper scripts have been made in order to retrieve a contract artifact for a given name and a given release. Once the artifact retrieved, one should deploy using directly the artifact, so using the `bytecode`, `abi`, etc... Even if this means a bit more work, the advantage is that we are now working with fixed artifacts that can no longer be modified.

The helper scripts are based on a "releases summary" that needs to be generated beforehand, i.e.

```console
# Generate ignored `releases/generated/summary.ts` file for TypeScript support
yarn generate-releases-summary
```

Once the summary, one can use the helpers defined in `scripts/artifacts.ts`. As an example, here is the script for deploying the current contracts for release `v1.3.1` using `hardhat-deploy`

```ts
// deploy/00-deploy-counter.ts
const deployCounter: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();

  const incrementOracleArtifact = await contract(
    "src/IncrementOracle.sol/IncrementOracle",
  ).getArtifact("v1.3.1");
  const incrementOracleDeployment = await hre.deployments.deploy(
    "IncrementOracle@v1.3.1",
    {
      contract: {
        abi: incrementOracleArtifact.abi,
        bytecode: incrementOracleArtifact.evm.bytecode.object,
        metadata: incrementOracleArtifact.metadata,
      },
      from: deployer,
      log: true,
    },
  );

  const counterArtifact = await contract("src/Counter.sol/Counter").getArtifact(
    "v1.3.1",
  );
  await hre.deployments.deploy("Counter@v1.3.1", {
    contract: {
      abi: counterArtifact.abi,
      bytecode: counterArtifact.evm.bytecode.object,
      metadata: counterArtifact.metadata,
    },
    libraries: {
      "src/IncrementOracle.sol:IncrementOracle":
        incrementOracleDeployment.address,
    },
    from: deployer,
    log: true,
  });
};
```

### Content of the NPM package

The NPM package will expose two things

1. A folder `abis` containg all the ABIs organized by release. Each ABI is available as a `JSON` file and as a `TypeScript const`,

```
* abis/
 * ├── <release-name>/
 * │   ├── <contract-path>:<contract-name>.json
 * │   ├── <contract-path>:<contract-name>.js
 * │   ├── <contract-path>:<contract-name>.d.ts
 * │   └── ...
 * └── ...

Note: Contract path has been formatted in order to replace `/` with `_` for folder org reasons. Names have been formatted as kebab case.
```

2. a file `deployment-summary.json` which organizes the deployments by networks and release, e.g.

```json
{
  "11155111": {
    "v1.3.1": {
      "Counter": "0x234d362c059E0AEFafE31b99B17667a98eA09f24",
      "IncrementOracle": "0x2ECB45036aa981DAe9ED8051D46368fAeaA6f04c"
    }
  }
}
```

The NPM package can then be installed and used in order to access the deployments and the ABIs:

```ts
import deployments from "sc-release-process-exploration/deployments-summary.json"
import { abi } from "sc-release-process-exploration/abis/v1.3.1/src_counter.sol_counter"

...
```
