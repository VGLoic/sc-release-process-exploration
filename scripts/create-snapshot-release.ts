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

async function createSnapshotRelease() {
  const args = process.argv.slice(2);
  const snapshotName = args[0];

  if (!snapshotName) {
    console.error("❌ Snapshot name is required");
    process.exitCode = 1;
    return;
  }

  // Check if the `./releases/snapshots/<snapshot-name>` folder already exists
  const hasSnapshotFolder = await fs
    .stat(`./releases/snapshots/${snapshotName}`)
    .catch(() => false);
  if (hasSnapshotFolder) {
    console.error(
      `❌ Snapshot release folder \`./releases/snapshots/${snapshotName}\` already exists. Please choose another name for the snapshot and try again. If it is an error, delete it and try again.`,
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
    const hasTmpFolder = await fs.stat("./releases/tmp").catch(() => false);
    if (hasTmpFolder) {
      await fs.rm("./releases/tmp", { recursive: true }).catch(() => {
        console.warn(
          `⚠️ An error occured while deleting the \`./releases/tmp\` folder. Please delete it manually and try again.`,
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
  const hasSnapshotFolder = await fs
    .stat(`./releases/snapshots/${snapshotName}`)
    .catch(() => false);
  if (hasSnapshotFolder) {
    await fs
      .rm(`./releases/snapshots/${snapshotName}`, { recursive: true })
      .catch(() => {
        console.warn(
          `⚠️ An error occured while deleting the \`./releases/snapshots/${snapshotName}\` folder. Please delete it manually and try again.`,
        );
      });
  }

  const hasSnapshotsFolder = await fs
    .stat("./releases/snapshots")
    .catch(() => false);
  if (hasSnapshotsFolder) {
    const snapshotsFolderContent = await fs.readdir("./releases/snapshots");
    if (snapshotsFolderContent.length === 0) {
      await fs.rm("./releases/snapshots", { recursive: true }).catch(() => {
        console.warn(
          `⚠️ An error occured while deleting the \`./releases/snapshots\` folder. Please delete it manually and try again.`,
        );
      });
    }
  }
}

async function copySnapshotCompilation(snapshotName: string) {
  const hasReleasesFolder = await fs.stat("./releases").catch(() => false);
  if (!hasReleasesFolder) {
    // Exit if there are no releases
    console.error(
      "❌ Releases folder has not been found at `./releases`. It should either alreay exist, or have been previously created by the hardhat compilation.",
    );
    throw new Error("Releases folder not found");
  }

  const hasTmpFolder = await fs.stat("./releases/tmp").catch(() => false);
  if (!hasTmpFolder) {
    // Exit if there are no tmp folder
    console.error(
      "❌ Tmp folder has not been found at `./releases/tmp`. It should have been previously created by the hardhat compilation.",
    );
    throw new Error("Tmp folder not found");
  }

  // Create the `./releases/smapshots` folder if it doesn't exist
  const hasSnapshotsFolder = await fs
    .stat("./releases/snapshots")
    .catch(() => false);
  if (!hasSnapshotsFolder) {
    await fs.mkdir("./releases/snapshots", { recursive: true });
  }

  // Rename the `./releases/tmp` folder to `./releases/snapshots/<snapshot-name>`
  await fs.rename("./releases/tmp", `./releases/snapshots/${snapshotName}`);
}

async function createDummyChangesetSnapshotRelease(snapshotName: string) {
  const changeset = {
    summary: "Snapshot release",
    releases: [
      { name: "sc-release-process-exploration", type: "minor" as const },
    ],
  };

  const id = await write(changeset, process.cwd());
  console.log("Successfully wrote changeset with id: ", id);

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
