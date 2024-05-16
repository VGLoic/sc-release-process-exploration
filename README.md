# Smart contracts release process exploration

This repository explores the possibilities for release process for smart contracts.

A first iteration is explained in this [document](README-v1.md).

## Motivation

There are two main problems we are trying to address here.

### 1. Compilation artifacts of previous releases are often lost

In many occasions, the artifacts are not commited in the repository and are therefore lost just after the contracts have been deployed. It may create all kind of annoying issues:

- not being able to re-deploy the exact same contracts or verify the contracts afterwards because the metadata have changed,
- having hard times interacting with the deployed contracts because the ABIs have changed.

As a smart contract developer, I want to be able to develop in an isolated way without worrying about modifying artifacts of previous releases.

And as a smart contract "dev ops", I want to be able to create a freeze of the code at a certain point in time and create the associated artifacts. The artifacts should be sufficient for any later uses such as deployments, transactions, Etherscan verifications or generation of packages for downstream uses.

### 2. Sharing compilation artifacts and deployment addresses is often messy

In many projects, ABIs and addresses are copy pasted. While this is fine in some simple cases, it is generally an important source of mistakes.

As a backend or frontend developer, I want to be able to access the releases artifacts and the deployment addresses.

## Goals

Solving the issues above can probably be done in many ways and will strongly depend on the project at hand.

However, let's try to define and implement some standard paths.

In each case, we are interested of managing multiple releases:

- the ones associated with particular `tag`, e.g. `v1.0.0`,
- the `latest` associated with the latest state of the codebase. This release evolves with the codebase.

### About compilation artifacts

Once a compilation with Hardhat has been made, a bunch of artifacts are generated. In particular, a `build info` file is generated and contains all the informations related to the compilation. The other artifacts are actually only some extracts from this core artifact.

**That is why we will try to only keep track of this `build info` file as single artifact for each release.**

### Path #1: the repository keeps everything

In this version, **we commit the release files and the deployments directly in the repository**.

We store the releases artifacts in the `releases` folder which is committed on the `main` branch. Different GitHub workflows will help us having this folder up to date:

- on `push` on `main`: the `latest` release is created or updated,
- on `push` on `tags`: the `<tag>` release is created,
- on `pull request`: nothing is updated but we generate a diff with the current state of the `latest` release.

Deployments will be stored in the `deployments` folder which is commited on the `main` branch too. Scripts are written in the repository in order to deploy contracts based on the artifacts contained in the `releases` folder.

A NPM package is created in order to share the ABIs and the deployments.

## Details about current iteration: `Path #1: the repository keeps everything`

The `main.yml` workflow file contains the heart of the artifacts release process

```yaml
jobs:
  release:
    name: Release latest
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
          node-version: 20.10
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
```

The `tags.yaml` worfklow will handle all the other releases and will be quite similar in terms of jobs.

### Deployments

When dealing with a list of releases, deployments must take into account which release we're considering. For each release, only a set of contracts is available.

As we can't rely on the usual integration of Hardhat or `hardhat-deploy`, helper scripts have been made in order to retrieve a contract artifact for a given name and a given release. Once the artifact retrieved, one should deploy using directly the artifact, so using the `bytecode`, `abi`, etc... Even if this means a bit more work, the advantage is that we are now working with fixed artifacts that can no longer be modified.

The helper scripts are based on a "releases summary" that needs to be generated beforehand, i.e.

```console
# Generate ignored `releases/generated/summary.ts` file
yarn generate-releases-summary
```

Once the summary, one can use the helpes defined in `scripts/v2/artifacts.ts`. As an example, here is the script for deploying the current contracts for latest release using `hardhat-deploy`

```ts
// deploy/00-deploy-counter.ts
const deployCounter: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();

  const incrementOracleArtifact = await contract(
    "src/IncrementOracle.sol/IncrementOracle",
  ).getArtifact("latest");
  const incrementOracleDeployment = await hre.deployments.deploy(
    "IncrementOracle@latest",
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
    "latest",
  );
  await hre.deployments.deploy("Counter@latest", {
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

## Version/Release manager

[Changesets](https://github.com/changesets/changesets) is used in order to manage versions here but any other tools can be freely chosen.

## What needs to be done

- Storing artifacts outside of the repository,
- Exploration for NPM package.
