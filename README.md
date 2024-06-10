# Smart contracts release process exploration

This repository explores the possibilities for release process for smart contracts.

A first iteration is explained in this [document](README-v1.md).

> [!NOTE]
> The process described here tries to answer in the most objective way to some problematics. However, it is ultimately opinionated and may not fit your target process. Opinions, feedbacks and improvements are obviously welcomed.

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

Additional details can be found in the [related documentation](documentation/repository-keeps-everything);

## Version/Release manager

[Changesets](https://github.com/changesets/changesets) is used in order to manage versions here but any other tools can be freely chosen.

## What needs to be done

- Storing artifacts outside of the repository.
