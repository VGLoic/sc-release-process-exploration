import {
  GetObjectCommand,
  ListObjectsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "fs/promises";
import { LOG_COLORS, ScriptError, toAsyncResult } from "../utils";
import { NodeJsClient } from "@smithy/types";

/**
 * Pulls releases from an S3 bucket
 * @param opts.force Whether to force the pull
 * @param opts.release A specific release to pull
 * @param awsConfig.bucketName The name of the bucket
 * @param awsConfig.bucketRegion The region of the bucket
 * @param awsConfig.accessKeyId The AWS access key ID
 * @param awsConfig.secretAccessKey The AWS secret access key
 * @returns An object with the remote releases, pulled releases, and failed releases
 */
export async function pull(
  opts: { force: boolean; release?: string },
  awsConfig: {
    bucketName: string;
    bucketRegion: string;
    accessKeyId: string;
    secretAccessKey: string;
  },
) {
  const s3: NodeJsClient<S3Client> = new S3Client({
    region: awsConfig.bucketRegion,
    credentials: {
      accessKeyId: awsConfig.accessKeyId,
      secretAccessKey: awsConfig.secretAccessKey,
    },
  });

  // List what's in the bucket
  const result = await s3.send(
    new ListObjectsCommand({
      Bucket: awsConfig.bucketName,
      Delimiter: "/",
      Prefix: "releases/",
    }),
  );
  const commonPrefixes = result.CommonPrefixes;
  if (!commonPrefixes) {
    return {
      remoteReleases: [],
      pulledReleases: [],
      failedReleases: [],
    };
  }
  const remoteReleases = [];
  for (const prefix of commonPrefixes) {
    const raw = prefix.Prefix;
    if (!raw) continue;
    remoteReleases.push(raw.replace("releases/", "").replace("/", ""));
  }

  if (opts.release && !remoteReleases.includes(opts.release)) {
    throw new ScriptError(
      `The release "${opts.release}" does not exist in the S3 bucket`,
    );
  }

  let localReleases: string[] = [];
  const doesReleasesFolderExist = await fs.stat("releases").catch(() => false);
  if (doesReleasesFolderExist) {
    // Get the list of releases as directories in the `releases` folder
    const releasesEntriesResult = await toAsyncResult(
      fs.readdir("releases", { withFileTypes: true }),
    );

    if (!releasesEntriesResult.success) {
      throw new ScriptError(
        "Error reading the contents of the releases directory",
      );
    }

    localReleases = releasesEntriesResult.value
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .filter((name) => name !== "generated");
  }

  const localReleasesSet = new Set(localReleases);

  let releasesToPull: string[];
  if (!opts.force) {
    if (opts.release) {
      if (localReleasesSet.has(opts.release)) {
        return {
          remoteReleases,
          pulledReleases: [],
          failedReleases: [],
        };
      }
      releasesToPull = [opts.release];
    } else {
      const missingReleases = remoteReleases.filter(
        (release) => !localReleasesSet.has(release),
      );

      if (missingReleases.length === 0) {
        return {
          remoteReleases,
          pulledReleases: [],
          failedReleases: [],
        };
      }

      if (missingReleases.length > 0) {
        console.log(
          LOG_COLORS.log,
          `\nFound ${missingReleases.length} missing releases, starting to pull`,
        );
      }

      releasesToPull = missingReleases;
    }
  } else {
    if (opts.release) {
      console.log(
        LOG_COLORS.log,
        `\nForce flag enabled, starting to pull release "${opts.release}"`,
      );
      releasesToPull = [opts.release];
    } else {
      console.log(
        LOG_COLORS.log,
        "\nForce flag enabled, starting to pull all releases",
      );
      releasesToPull = remoteReleases;
    }
  }

  async function pullRelease(releaseToPull: string) {
    const getObjectCommand = new GetObjectCommand({
      Bucket: awsConfig.bucketName,
      Key: `releases/${releaseToPull}/build-info.json`,
    });
    const getObjectResult = await toAsyncResult(s3.send(getObjectCommand));
    if (!getObjectResult.success) {
      throw new ScriptError(
        `Error fetching the "build-info.json" for release "${releaseToPull}"`,
      );
    }

    const body = getObjectResult.value.Body;
    if (!body) {
      throw new ScriptError(
        `Error fetching the "build-info.json" for release "${releaseToPull}"`,
      );
    }

    const releaseDirectoryCreationResult = await toAsyncResult(
      fs.mkdir(`releases/${releaseToPull}`, { recursive: true }),
    );
    if (!releaseDirectoryCreationResult.success) {
      throw new ScriptError(
        `Error creating the release directory for "${releaseToPull}"`,
      );
    }

    const copyResult = await toAsyncResult(
      fs.writeFile(
        `releases/${releaseToPull}/build-info.json`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body.transformToWebStream() as any,
      ),
    );
    if (!copyResult.success) {
      throw new ScriptError(
        `Error copying the "build-info.json" for release "${releaseToPull}"`,
      );
    }
  }

  const pullResults = await Promise.allSettled(
    releasesToPull.map(async (releaseToPull) =>
      pullRelease(releaseToPull)
        .then(() => {
          console.log(
            LOG_COLORS.success,
            `\nSuccessfully pulled release "${releaseToPull}"`,
          );
        })
        .catch((err) => {
          console.error(
            LOG_COLORS.error,
            `\nError pulling release "${releaseToPull}": ${err.message}`,
          );
          throw err;
        }),
    ),
  );

  const pulledReleases = [];
  const failedReleases = [];
  for (let i = 0; i < pullResults.length; i++) {
    const releaseToPull = releasesToPull[i];
    if (pullResults[i].status === "fulfilled") {
      pulledReleases.push(releaseToPull);
    } else {
      failedReleases.push(releaseToPull);
    }
  }

  return {
    remoteReleases,
    pulledReleases,
    failedReleases,
  };
}
