# Smart contracts release process exploration

This repository explores the possibilities for release process for smart contracts.

A first iteration is explained in this [document](README-v1.md).

## Motivation

The goal is to satisfy in the simplest way possible the different actors:

- Smart contract developers want to develop in an isolated way and not worrying about modifying artifacts of previous releases,
- Smart contract "DevOps" want to have a simple way to create a freeze of the code at a certain point in time and create the associated artifacts. The artifacts should be sufficient for any later uses such as deployments, transactions, Etherscan verifications or generation of packages for downstream uses,
- Backend and Frontend developers want to have a simple and safe way to interact with a contract given its release version.

## What has been done in this iteration

The piece of interest in a Hardhat compilation is the `build info` file. This iteration focuses on simply storing and using this file for each release. Everything is stored on the `main` branch.

For now, the process is to have:

- a `latest` release:
  - stored in `releases/latest/build-info.json`,
  - updated on push on `main` branch.
- as many as we want other releases, identified by `tag`:
  - stored in `releases/<tag name>/build-info.json` in the `main` branch,
  - created on push on tags.

The associated workflows have been made:

- pr.yml: compile the artifacts, create a diff with the artifacts in `latest` release and publish a comment on the PR of the list of differences,
- main.yml: compile the artifacts, copy them in `releases/latest` and commit the changes in `main` branch,
- releases.yml: compile the artifacts, copy them in `releases/<tag name>` and commit the changes in the `main` branch.

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
- Exploration for NPM package,
- Exploration for deployment.
