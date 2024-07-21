import fs from "fs/promises";
import { toAsyncResult, ZBuildInfo } from "../utils";

export async function retrieveFreshBuildInfo() {
  const BUILD_INFO_PATH = "artifacts/build-info";
  const hasBuildInfoFolder = await fs.stat(BUILD_INFO_PATH).catch(() => false);
  if (!hasBuildInfoFolder) {
    throw new Error(`Build info folder not found at ${BUILD_INFO_PATH}`);
  }

  const buildInfoFolderResult = await toAsyncResult(
    fs.readdir(BUILD_INFO_PATH),
  );
  if (!buildInfoFolderResult.success) {
    throw new Error(
      `Error reading build info folder: ${buildInfoFolderResult.error}`,
    );
  }

  if (buildInfoFolderResult.value.length > 1) {
    throw new Error(
      `Expected exactly one build info file, found ${buildInfoFolderResult.value.length}`,
    );
  }
  const buildInfoFileName = buildInfoFolderResult.value.at(0);
  if (!buildInfoFileName) {
    throw new Error(`No build info file found`);
  }
  if (!buildInfoFileName.endsWith(".json")) {
    throw new Error(`Build info file is not a json file: ${buildInfoFileName}`);
  }

  const contentResult = await toAsyncResult(
    fs
      .readFile(`${BUILD_INFO_PATH}/${buildInfoFileName}`, "utf-8")
      .then((data) => {
        const firstParsing = JSON.parse(data);
        ZBuildInfo.parse(firstParsing);
        return data;
      }),
  );

  if (!contentResult.success) {
    throw new Error(`Error reading build info file: ${contentResult.error}`);
  }

  return {
    path: `${BUILD_INFO_PATH}/${buildInfoFileName}`,
    content: contentResult.value,
  };
}
