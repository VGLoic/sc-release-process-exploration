# Smart contracts release process exploration

This repository explores the possibilities for release process for smart contracts.

A first (outdated) iteration is explained in this [document](README-v1.md).

> [!NOTE]
> The process described here tries to answer in the most objective way to some problematics. However, it stays ultimately opinionated and may not be a fit for some processes. Opinions, feedbacks and improvements are welcomed.

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

> [!NOTE]
> We are using [Changesets](https://github.com/changesets/changesets) in order to manage release of the NPM package.
> Because of this, we don't rely on the `push on tags` workflow as this part is automated by Changesets.
> Instead, the `main` workflow executes a particular `release` script that contains the logic to take into account the new release and the build for the NPM package.

Deployments will be stored in the `deployments` folder which is commited on the `main` branch too. Scripts are written in the repository in order to deploy contracts based on the artifacts contained in the `releases` folder.

A NPM package is created in order to share the ABIs and the deployments.

Additional details can be found in the [related documentation](documentation/repository-keeps-everything.md).

### Path #2: the artifacts are stored remotely (AWS S3 bucket)

In this version, **the release files are stored on a remote storage location**, the deployments are still kept locally in this repository.

The remote storage location is an [AWS S3 Bucket](https://aws.amazon.com/pm/serv-s3).

When needed, the developer will download the releases artifacts in order to perform some operations, e.g. a deployment. The differences with the path #1 are:

- the `releases` folder is not committed, hence there is no issues about repository size or big pull requests,
- only those who need to perform operations with the releases artifacts need to download them,
- the remote storage location allows for an API access by other services if needed.

We will find the same GitHub workdlows than before, but slightly modified:

- on `push` on `main`: the `latest` release is created locally and then copied to the remote storage,
- on `push` on `tags`: the `<tag>` release is created locally and then copied to the remote storage,
- on `pull request`: nothing is updated but we download the `latest` release and we generate a diff with the current state of the `latest` release.

> [!NOTE]
> Two implementations exist for this version.
> The first one relies on a local CLI, see this [commit](https://github.com/VGLoic/sc-release-process-exploration/commit/7516cbcdd9f31a162dd27bd8075be819bafbdd31).
> The second one relies on a dedicated Hardhat plugin [Hardhat Soko](https://github.com/VGLoic/hardhat-soko), see latest version of this repository.

> [!NOTE]
> We are using [Changesets](https://github.com/changesets/changesets) in order to manage release of the NPM package.
> Because of this, we don't rely on the `push on tags` workflow as this part is automated by Changesets.
> Instead, the `main` workflow executes a particular `release` script that contains the logic upload the new release, download the existing releases and the build for the NPM package.

The deployments and NPM package works exactly in the same way than in the path #1. Except that one has to download the releases artifacts in order to perform a deployment.

Additional details can be found in the [related documentation](documentation/remote-storage-location.md).

## Version/Release manager

[Changesets](https://github.com/changesets/changesets) is used in order to manage versions here but any other tools can be freely chosen.
