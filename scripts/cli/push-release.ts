import { toAsyncResult } from "../utils";
import { LOG_COLORS, retrieveFreshBuildInfo, ScriptError } from "./utils";
import { ReleaseStorageProvider } from "./s3-bucket-provider";

export async function pushRelease(
  release: string,
  opts: {
    force: boolean;
  },
  releaseStorageProvider: ReleaseStorageProvider,
) {
  const freshBuildInfoResult = await toAsyncResult(retrieveFreshBuildInfo());
  if (!freshBuildInfoResult.success) {
    throw new ScriptError(
      `❌ Error retrieving the build info for the compilation. Please, make sure to have a unique build info file in the "artifacts/build-info" folder.`,
    );
  }

  const hasReleaseResult = await toAsyncResult(
    releaseStorageProvider.hasRelease(release),
  );
  if (!hasReleaseResult.success) {
    throw new ScriptError(
      `Error checking if the release "${release}" exists on the storage`,
    );
  }

  if (hasReleaseResult.value) {
    if (!opts.force) {
      throw new ScriptError(
        `The release "${release}" already exists on the storage. Please, make sure to use a different release name.`,
      );
    } else {
      console.log(
        LOG_COLORS.warn,
        `The release "${release}" already exists on the storage. Forcing the push of the release.`,
      );
    }
  }

  const pushResult = await toAsyncResult(
    releaseStorageProvider.pushRelease(
      release,
      freshBuildInfoResult.value.content,
    ),
  );

  if (!pushResult.success) {
    throw new ScriptError(
      `Error pushing the release "${release}" to the storage`,
    );
  }
}
