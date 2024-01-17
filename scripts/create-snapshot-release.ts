import fs from "fs/promises";
import write from "@changesets/write";
import applyReleasePlan from "@changesets/apply-release-plan";
import assembleReleasePlan from "@changesets/assemble-release-plan";
import readChangesets from "@changesets/read";
import { read } from "@changesets/config";
import { getPackages } from "@manypkg/get-packages";
import { readPreState } from "@changesets/pre";
import { execSync } from "child_process";
import { toResult } from "./utils";
import path from "node:path";
import {
  RELEASES_FOLDER,
  RELEASES_TMP_FOLDER,
  SNAPSHOTS_RELEASES_FOLDER,
} from "./constants";

async function createSnapshotRelease() {
  const args = process.argv.slice(2);
  const snapshotName = args[0];

  if (!snapshotName) {
    console.error("❌ Snapshot name is required");
    process.exitCode = 1;
    return;
  }

  const snapshotReleasePath = path.join(
    SNAPSHOTS_RELEASES_FOLDER,
    snapshotName,
  );

  // Check if the `./releases/snapshots/<snapshot-name>` folder already exists
  const hasSnapshotFolder = await fs
    .stat(snapshotReleasePath)
    .catch(() => false);
  if (hasSnapshotFolder) {
    console.error(
      `❌ Snapshot release folder \`${snapshotReleasePath}\` already exists. Please choose another name for the snapshot and try again. If it is an error, delete it and try again.`,
    );
    process.exitCode = 1;
    return;
  }

  execSync("yarn format:contracts");

  try {
    execSync("hardhat compile --config hardhat.config.release.ts");
    await copySnapshotCompilation(snapshotName);
  } catch (err) {
    console.error(
      "❌ An error occured while creating the snapshot release artifacts.",
    );
    console.error(err);

    // If the `tmp` folder exists, we delete it
    const hasTmpFolder = await fs.stat(RELEASES_TMP_FOLDER).catch(() => false);
    if (hasTmpFolder) {
      await fs.rm(RELEASES_TMP_FOLDER, { recursive: true }).catch(() => {
        console.warn(
          `⚠️ An error occured while deleting the \`${RELEASES_TMP_FOLDER}\` folder. Please delete it manually and try again.`,
        );
      });
    }
    // If the `snapshots/<snapshot-name>` folder exists, we delete it
    await deleteSnapshotRelease(snapshotName);

    process.exitCode = 1;
    return;
  }

  execSync("yarn release:generate-delta");

  execSync("yarn release:build");

  execSync("yarn release:copy-dist");

  const changesetReleaseResult = await toResult(
    createDummyChangesetSnapshotRelease(snapshotName),
  );
  if (!changesetReleaseResult.ok) {
    console.error(
      "❌ An error occured while creating the changeset release. The created release will be deleted. Please check the error below and try again.",
    );
    console.error(changesetReleaseResult.error);

    // If the `snapshots/<snapshot-name>` folder exists, we delete it
    await deleteSnapshotRelease(snapshotName);

    process.exitCode = 1;
    return;
  }

  execSync(`yarn changeset publish --tag ${snapshotName} --no-git-tag`);
}

async function deleteSnapshotRelease(snapshotName: string) {
  const snapshotReleasePath = path.join(
    SNAPSHOTS_RELEASES_FOLDER,
    snapshotName,
  );
  const hasSnapshotFolder = await fs
    .stat(snapshotReleasePath)
    .catch(() => false);
  if (hasSnapshotFolder) {
    await fs.rm(snapshotReleasePath, { recursive: true }).catch(() => {
      console.warn(
        `⚠️ An error occured while deleting the \`${snapshotReleasePath}\` folder. Please delete it manually and try again.`,
      );
    });
  }

  const hasSnapshotsFolder = await fs
    .stat(SNAPSHOTS_RELEASES_FOLDER)
    .catch(() => false);
  if (hasSnapshotsFolder) {
    const snapshotsFolderContent = await fs.readdir(SNAPSHOTS_RELEASES_FOLDER);
    if (snapshotsFolderContent.length === 0) {
      await fs.rm(SNAPSHOTS_RELEASES_FOLDER, { recursive: true }).catch(() => {
        console.warn(
          `⚠️ An error occured while deleting the \`${SNAPSHOTS_RELEASES_FOLDER}\` folder. Please delete it manually and try again.`,
        );
      });
    }
  }
}

async function copySnapshotCompilation(snapshotName: string) {
  const snapshotReleasePath = path.join(
    SNAPSHOTS_RELEASES_FOLDER,
    snapshotName,
  );
  const hasReleasesFolder = await fs.stat(RELEASES_FOLDER).catch(() => false);
  if (!hasReleasesFolder) {
    // Exit if there are no releases
    console.error(
      `❌ Releases folder has not been found at \`${RELEASES_FOLDER}\`. It should either alreay exist, or have been previously created by the hardhat compilation.`,
    );
    throw new Error("Releases folder not found");
  }

  const hasTmpFolder = await fs.stat(RELEASES_TMP_FOLDER).catch(() => false);
  if (!hasTmpFolder) {
    // Exit if there are no tmp folder
    console.error(
      `❌ Tmp folder has not been found at \`${RELEASES_TMP_FOLDER}\`. It should have been previously created by the hardhat compilation.`,
    );
    throw new Error("Tmp folder not found");
  }

  // Create the `./releases/smapshots` folder if it doesn't exist
  const hasSnapshotsFolder = await fs
    .stat(SNAPSHOTS_RELEASES_FOLDER)
    .catch(() => false);
  if (!hasSnapshotsFolder) {
    await fs.mkdir(SNAPSHOTS_RELEASES_FOLDER, { recursive: true });
  }

  // Rename the `./releases/tmp` folder to `./releases/snapshots/<snapshot-name>`
  await fs.rename(RELEASES_TMP_FOLDER, snapshotReleasePath);
}

async function createDummyChangesetSnapshotRelease(snapshotName: string) {
  // Taken from https://github.com/changesets/changesets/blob/main/packages/write/README.md
  const changeset = {
    summary: "Snapshot release",
    releases: [
      { name: "sc-release-process-exploration", type: "minor" as const },
    ],
  };
  const id = await write(changeset, process.cwd());
  console.log("Successfully wrote changeset with id: ", id);

  // Taken from https://github.com/changesets/changesets/blob/main/packages/assemble-release-plan/README.md
  const packages = await getPackages(process.cwd());
  const preState = await readPreState(process.cwd());
  const config = await read(process.cwd(), packages);
  const changesets = await readChangesets(process.cwd());
  const releasePlan = assembleReleasePlan(
    changesets,
    packages,
    config,
    preState,
    snapshotName,
  );

  await applyReleasePlan(releasePlan, packages, undefined, snapshotName);
}

createSnapshotRelease();
