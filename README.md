# Smart contracts release process exploration

This repository explores the possibilities for release process for smart contracts.

A first iteration is explained in this [document](README-v1.md).

## Motivation

The goal is to satisfy in the simplest way possible the different actors:

- Smart contract developers want to develop in an isolated way and not worrying about modifying artifacts of previous releases,
- Smart contract "DevOps" want to have a simple way to create a freeze of the code at a certain point in time and create the associated artifacts. The artifacts should be sufficient for any later uses such as deployments, transactions, Etherscan verifications or generation of packages for downstream uses,
- Backend and Frontend developers want to have a simple and safe way to interact with a contract given its release version.

## What has been done in this iteration

The piece of interest in a Hardhat compilation is the `build info` file. This iteration focuses on simply storing and using this file for each release.

For now, the process is to have:

- a `latest` release:
  - stored in `releases/latest/build-info.json`,
  - updated on push on `main` branch.
- as many as we want other releases:
  - stored in `releases/<release name>/build-info.json` in the release branch,
  - created on releases.

The associated workflows have been made:

- pr.yml: compile the artifacts, create a diff with the artifacts in `latest` release and publish a comment on the PR of the list of differences,
- main.yml: compile the artifacts, copy them in `releases/latest` and commit the changes in `main` branch,
- releases.yml: compile the artifacts, copy them in `releases/<tag name>` and commit the changes in the release branch.

## What needs to be done

- Storing artifacts outside of the repository,
- Exploration for NPM package,
- Exploration for deployment.
