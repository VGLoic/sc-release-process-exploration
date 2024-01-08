# Smart contracts release process exploration

This repository illustrates a release process for the smart contracts.

**The repository contains the compilation artifacts of the previous releases. Each release's artifacts are static and sufficient for deployment/interaction and verification on Etherscan.**

**From the releases artifacts, a NPM package can be published containing the ABIs organized by contracts and release version.**

## Motivation

The goal is to satisfy in the simplest way possible the different actors:
- Smart contract developers want to develop in an isolated way and not worrying about modifying artifacts of previous releases,
- Smart contract "DevOps" want to have a simple way to create a freeze of the code at a certain point in time and create the associated artifacts. The artifacts should be sufficient for any later uses such as deployments, transactions, Etherscan verifications or generation of packages for downstream uses,
- Backend and Frontend developers want to have a simple and safe way to interact with a contract given its release version.

## Practical release process

Once code is ready to be released,
1. if not already there, add a changeset describing the changes and the version bump (see the *Release process details* section below for more details),
```console
yarn changeset
```
2. prepare the release artifacts that will define the release, the artifacts will be committed to this repository
```console
yarn release:prepare
```
3. commit in a dedicated branch, create a PR and merge it,
4. merge the automated Changeset PR.

## Release process details

The first need for the process is the management of the `version`. This repository uses [semver](https://semver.org/) versionning. In practice, version is managed here using [Changesets](https://github.com/changesets/changesets/tree/main).

> [!NOTE]
> Changesets let contributors declare how their changes should be released. 
> 
> Developers can add a *changeset* alongside their changes with a type *major*, *minor* or *patch* and a description. Before releasing, all changesets are consumed in order to derive the next release version.

Once code is ready for a release,
1. the *changesets* are consumed and the next release version is fixed,
2. a compilation of the smart contracts is performed and artifacts are stored under a temporary folder `releases/tmp`,
3. the `releases/tmp` is renamed using the release version: `releases/<release name>`, at this point the `releases` folder looks like
```
releases
├── <release-name a>
│   └── artifacts
│       ├── build-info
│       │   └── <build info file name>.json
│       └── src
│           ├── <contract-name>.sol
│           │   └── <contract-name>.dbg.json
│           │   └── <contract-name>.json
│           └── ...
└── <release-name b>
    └── artifacts
        ├── build-info
        │   └── <build info file name>.json
        └── src
            ├── <contract-name>.sol
            │   └── <contract-name>.dbg.json
            │   └── <contract-name>.json
            └── ...
```

In this case, the contracts are assumed to be under `src` folder.

Each release folder is completely independent and contains all the informations for later operations.

Once step 3. is performed, the rest of the process can be performed. This part is highly opinionated and is inspired from real-world needs.

4. the delta between each releases is generated: the list of versions for each contract is built. If a contract has not changed since the previous release, it will be ignored. At this point the `releases` folder looks like
```
releases
├── generated-delta
|   │   ├── <contract-name>
|   │   │   ├── <release-name a>.json // No change between release a and b
|   │   │   ├── <release-name c>.json
|   │   │   └── ...
|   │   └── ...
|   └── build-infos
|       ├── <release-name a>.json
|       ├── <release-name b>.json
|       ├── <release-name c>.json
|       └── ...
├── <release-name a>
│   └── artifacts
│       ├── build-info
│       │   └── <build info file name>.json
│       └── src
│           ├── <contract-name>.sol
│           │   └── <contract-name>.dbg.json
│           │   └── <contract-name>.json
│           └── ...
├── <release-name b>
│   └── artifacts
│       ├── build-info
│       │   └── <build info file name>.json
│       └── src
│           ├── <contract-name>.sol
│           │   └── <contract-name>.dbg.json
│           │   └── <contract-name>.json
│           └── ...
└── <release-name c>
    └── artifacts
        ├── build-info
        │   └── <build info file name>.json
        └── src
            ├── <contract-name>.sol
            │   └── <contract-name>.dbg.json
            │   └── <contract-name>.json
            └── ...
```
5. the final step is to build the artifacts that will be exposed to downstream consumers through a NPM package. In this repository, only the ABIs are exposed, exposure is made as `json` file or as `TypeScript const`. This build uses [tsup](https://tsup.egoist.dev/) to realize the compilations. The generated artifacts are exposed in a git ignored `dist` folder with the following form
```
dist
├── <contract-name>
│   ├── <release-name a>.json
│   ├── <release-name a>.js
│   ├── <release-name a>.d.ts
│   ├── <release-name c>.json
│   ├── <release-name c>.js
│   ├── <release-name c>.d.ts
|   └── ...
└── ...
```
6. the `dist` folder is copied in a more friendly exposed `abis` folder for consumers.

## Snapshot releases

Releases are meant to be created once the code is considered stable. This is not the case during the development process but backend and frontend developers may alreay want to have access to the new ABIs, *snapshot releases* are introduced here as a way to solve this issue.

From the [Changesets documentation](https://github.com/changesets/changesets/blob/main/docs/snapshot-releases.md):
> Snapshot releases are a way to release your changes for testing without updating the versions. Both a modified `version` and a modified `publish` command are used to do accomplish a snapshot release. After both processes run, you will have a published version of packages in changesets with a version of `0.0.0-{tag}-DATETIMESTAMP`.

In order to publish a snapshot release, one first creates a branch `snapshot/<snapshot name>` with the target smart contract codebase. Once the branch is created,
- **If the user has the authorization to publish the NPM package**, he/she can run `yarn snapshot-release <snapshot-name>`. At this point, the branch can be deleted,
- **Otherwise**, the user can push the branch, even if there are no changes, to the remote registry, i.e. `git push`. If the branch was correctly named, it will trigger a workflow in order to create the snapshot release.


## About deployment

Deployment is considered as operations using one or multiple previous releases. It is therefore a consumer of the release process but it is not part of the release process.

However, it impacts the content of a release as it must satisfy the needs of later deployment operations.

Additional development may be later added on this.
