import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { NodeJsClient } from "@smithy/types";
import fs from "fs/promises";
import { LOG_COLORS, ScriptError, toAsyncResult } from "../utils";
import { retrieveFreshBuildInfo } from "./utils";

export async function pushRelease(
  release: string,
  opts: {
    force: boolean;
  },
  awsConfig: {
    bucketName: string;
    bucketRegion: string;
    accessKeyId: string;
    secretAccessKey: string;
  },
) {
  const freshBuildInfoResult = await toAsyncResult(retrieveFreshBuildInfo());
  if (!freshBuildInfoResult.success) {
    throw new ScriptError(
      `❌ Error retrieving the build info for the compilation. Please, make sure to have a unique build info file in the \"artifacts/build-info\" folder.`,
    );
  }

  const s3: NodeJsClient<S3Client> = new S3Client({
    region: awsConfig.bucketRegion,
    credentials: {
      accessKeyId: awsConfig.accessKeyId,
      secretAccessKey: awsConfig.secretAccessKey,
    },
  });

  const headCommand = new HeadObjectCommand({
    Bucket: awsConfig.bucketName,
    Key: `releases/${release}/build-info.json`,
  });
  const headResult = await toAsyncResult(s3.send(headCommand));
  if (!headResult.success) {
    throw new ScriptError(
      `Error checking if the release \"${release}\" exists on the S3 bucket`,
    );
  }

  if (headResult.value) {
    if (!opts.force) {
      throw new ScriptError(
        `The release \"${release}\" already exists on the S3 bucket. Please, make sure to use a different release name.`,
      );
    } else {
      console.log(
        LOG_COLORS.warn,
        `The release \"${release}\" already exists on the S3 bucket. Forcing the push of the release.`,
      );
    }
  }

  const putCommand = new PutObjectCommand({
    Bucket: awsConfig.bucketName,
    Key: `releases/${release}/build-info.json`,
    Body: freshBuildInfoResult.value.content,
  });

  const putResult = await toAsyncResult(s3.send(putCommand));
  if (!putResult.success) {
    throw new ScriptError(
      `Error pushing the release \"${release}\" to the S3 bucket`,
    );
  }
}
