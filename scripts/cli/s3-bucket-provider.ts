import {
  GetObjectCommand,
  ListObjectsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { NodeJsClient } from "@smithy/types";

type S3BucketProviderConfig = {
  bucketName: string;
  bucketRegion: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
};
export class S3BucketProvider {
  private readonly config: S3BucketProviderConfig;
  private readonly client: NodeJsClient<S3Client>;
  private readonly releasePath: string;

  constructor(config: S3BucketProviderConfig) {
    const s3Client: NodeJsClient<S3Client> = new S3Client({
      region: config.bucketRegion,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    this.releasePath = config.prefix
      ? `${config.prefix}/releases/`
      : "releases/";
    this.config = config;
    this.client = s3Client;
  }

  public async hasRelease(release: string): Promise<boolean> {
    const headCommand = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: `${this.releasePath}/${release}/build-info.json`,
    });
    const headResult = await this.client.send(headCommand);
    return Boolean(headResult);
  }

  public async pushRelease(release: string, content: string) {
    const key = `${this.releasePath}/${release}/build-info.json`;
    const putCommand = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      Body: content,
    });
    await this.client.send(putCommand);

    return key;
  }

  public async listReleases() {
    const listCommand = new ListObjectsCommand({
      Bucket: this.config.bucketName,
      Delimiter: "/",
      Prefix: this.releasePath,
    });
    const listResult = await this.client.send(listCommand);
    const commonPrefixes = listResult.CommonPrefixes;
    if (!commonPrefixes) {
      return [];
    }
    const releases = [];
    for (const prefix of commonPrefixes) {
      const raw = prefix.Prefix;
      if (!raw) continue;
      const release = raw.replace(this.releasePath, "").replace("/", "");
      releases.push(release);
    }
    return releases;
  }

  public async pullRelease(release: string) {
    const getObjectCommand = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: `${this.releasePath}/${release}/build-info.json`,
    });
    const getObjectResult = await this.client.send(getObjectCommand);
    if (!getObjectResult.Body) {
      throw new Error("Error fetching the build info");
    }
    return getObjectResult.Body;
  }
}
