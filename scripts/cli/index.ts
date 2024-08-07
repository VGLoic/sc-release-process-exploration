import { Command } from "commander";
import { generateReleasesSummary } from "./generate-releases-summary";
import { z } from "zod";
import dotenv from "dotenv";
import { toAsyncResult } from "../utils";
import { pull } from "./pull";
import { retrieveReleasesSummary } from "./retrieve-releases-summary";
import { pushRelease } from "./push-release";
import { generateDiffWithLatest } from "./diff-with-latest";
import { LOG_COLORS, ScriptError } from "./utils";
import { S3BucketProvider } from "./s3-bucket-provider";
dotenv.config();

const program = new Command()
  .version("0.0.1")
  .option("-d, --debug", "output extra debugging")
  .description(
    "CLI for managing remote releases with its associated smart contract artifacts",
  );

program
  .command("pull")
  .description(
    "Pull the missing releases from the release storage and generate associated typings",
  )
  .option(
    "-r, --release <release>",
    "A specific release to pull from the release storage. If not provided, all missing releases will be pulled",
  )
  .option("-f, --force", "Force the pull of the releases, replacing local ones")
  .option(
    "--no-typing-generation",
    "Do not generate typings for the pulled releases",
  )
  .option(
    "--no-filter",
    "Do not filter similar contract in subsequent releases when generating typings",
  )
  .action(async (opts) => {
    const envParsingResult = z
      .object({
        AWS_S3_BUCKET: z.string().min(1),
        AWS_ACCESS_KEY_ID: z.string().min(1),
        AWS_SECRET_ACCESS_KEY: z.string().min(1),
        AWS_REGION: z.string().min(1),
      })
      .safeParse(process.env);
    if (!envParsingResult.success) {
      console.log(LOG_COLORS.error, "❌ Invalid environment variables");
      process.exitCode = 1;
      return;
    }

    console.log(
      LOG_COLORS.log,
      "\nEnvironment variables for AWS S3 bucket detected for Release Storage Provider",
    );
    const releaseStorageProvider = new S3BucketProvider({
      bucketName: envParsingResult.data.AWS_S3_BUCKET,
      bucketRegion: envParsingResult.data.AWS_REGION,
      accessKeyId: envParsingResult.data.AWS_ACCESS_KEY_ID,
      secretAccessKey: envParsingResult.data.AWS_SECRET_ACCESS_KEY,
    });

    const optsParsingResult = z
      .object({
        release: z.string().optional(),
        force: z.boolean().default(false),
        typingGeneration: z.boolean().default(true),
        filter: z.boolean().default(true),
        debug: z.boolean().default(false),
      })
      .safeParse(opts);
    if (!optsParsingResult.success) {
      console.log(LOG_COLORS.error, "❌ Invalid arguments");
      process.exitCode = 1;
      return;
    }

    if (optsParsingResult.data.release) {
      console.log(
        LOG_COLORS.log,
        `\nPulling the release "${optsParsingResult.data.release}" from the S3 bucket`,
      );
    } else {
      console.log(
        LOG_COLORS.log,
        "\nPulling the missing releases from the S3 bucket",
      );
    }

    const pullResult = await toAsyncResult(
      pull(optsParsingResult.data, releaseStorageProvider),
      { debug: optsParsingResult.data.debug },
    );
    if (!pullResult.success) {
      if (pullResult.error instanceof ScriptError) {
        console.log(LOG_COLORS.error, "❌ ", pullResult.error.message);
        process.exitCode = 1;
        return;
      }
      console.log(
        LOG_COLORS.error,
        "❌ An unexpected error occurred: ",
        pullResult.error,
      );
      process.exitCode = 1;
      return;
    }

    if (pullResult.value.remoteReleases.length === 0) {
      console.log(LOG_COLORS.success, "\nNo releases to pull yet");
    } else if (
      pullResult.value.failedReleases.length === 0 &&
      pullResult.value.pulledReleases.length === 0
    ) {
      console.log(
        LOG_COLORS.success,
        `\nYou're up to date with ${pullResult.value.remoteReleases.length} releases:`,
      );
      pullResult.value.remoteReleases.forEach((release) => {
        console.log(LOG_COLORS.success, ` - ${release}`);
      });
    } else {
      if (pullResult.value.pulledReleases.length > 0) {
        console.log(
          LOG_COLORS.success,
          `\nPulled ${pullResult.value.pulledReleases.length} releases from storage:`,
        );
        pullResult.value.pulledReleases.forEach((release) => {
          console.log(LOG_COLORS.success, ` - ${release}`);
        });
      }

      if (pullResult.value.failedReleases.length > 0) {
        console.log(
          LOG_COLORS.error,
          `\n❌ Failed to pull ${pullResult.value.failedReleases.length} releases:`,
        );
        pullResult.value.failedReleases.forEach((release) => {
          console.log(LOG_COLORS.error, ` - ${release}`);
        });
        console.log("\n");
      }
    }

    if (optsParsingResult.data.typingGeneration) {
      await generateReleasesSummary(optsParsingResult.data.filter, {
        debug: optsParsingResult.data.debug,
      }).catch((err) => {
        if (err instanceof ScriptError) {
          console.log(LOG_COLORS.error, "❌ ", err.message);
          process.exitCode = 1;
          return;
        }
        console.log(LOG_COLORS.error, "❌ An unexpected error occurred: ", err);
        process.exitCode = 1;
      });

      console.log(LOG_COLORS.success, "\nTypings generated successfully\n");
    }
  });

program
  .command("push")
  .argument("<release>", "The release to push to the release storage")
  .description("Push a release to the release storage")
  .option(
    "-f, --force",
    "Force the push of the release even if it already exists in the bucket",
  )
  .action(async (release, args) => {
    const envParsingResult = z
      .object({
        AWS_S3_BUCKET: z.string().min(1),
        AWS_ACCESS_KEY_ID: z.string().min(1),
        AWS_SECRET_ACCESS_KEY: z.string().min(1),
        AWS_REGION: z.string().min(1),
      })
      .safeParse(process.env);
    if (!envParsingResult.success) {
      console.log(LOG_COLORS.error, "❌ Invalid environment variables");
      process.exitCode = 1;
      return;
    }

    console.log(
      LOG_COLORS.log,
      "\nEnvironment variables for AWS S3 bucket detected for Release Storage Provider",
    );
    const releaseStorageProvider = new S3BucketProvider({
      bucketName: envParsingResult.data.AWS_S3_BUCKET,
      bucketRegion: envParsingResult.data.AWS_REGION,
      accessKeyId: envParsingResult.data.AWS_ACCESS_KEY_ID,
      secretAccessKey: envParsingResult.data.AWS_SECRET_ACCESS_KEY,
    });

    if (!release) {
      console.log(LOG_COLORS.error, "❌ No release provided");
      process.exitCode = 1;
      return;
    }

    const optsParsingResult = z
      .object({
        force: z.boolean().default(false),
        debug: z.boolean().default(false),
      })
      .safeParse(args);
    if (!optsParsingResult.success) {
      console.log(LOG_COLORS.error, "❌ Invalid arguments");
      process.exitCode = 1;
      return;
    }

    console.log(
      LOG_COLORS.log,
      `\nPushing release "${release}" artifact to the S3 bucket`,
    );

    const pushResult = await toAsyncResult(
      pushRelease(release, optsParsingResult.data, releaseStorageProvider),
    );
    if (!pushResult.success) {
      if (pushResult.error instanceof ScriptError) {
        console.log(LOG_COLORS.error, "❌ ", pushResult.error.message);
        process.exitCode = 1;
        return;
      }
      console.log(
        LOG_COLORS.error,
        "❌ An unexpected error occurred: ",
        pushResult.error,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      LOG_COLORS.success,
      `\nRelease "${release}" pushed successfully`,
    );
  });

program
  .command("describe")
  .description("Describe releases and their contents")
  .action(async (opts) => {
    const optsParsingResult = z
      .object({
        debug: z.boolean().default(false),
      })
      .safeParse(opts);
    if (!optsParsingResult.success) {
      console.log(LOG_COLORS.error, "❌ Invalid arguments");
      process.exitCode = 1;
      return;
    }
    const releasesSummaryResult = await toAsyncResult(
      retrieveReleasesSummary({ debug: optsParsingResult.data.debug }),
      { debug: optsParsingResult.data.debug },
    );
    if (!releasesSummaryResult.success) {
      if (releasesSummaryResult.error instanceof ScriptError) {
        console.log(
          LOG_COLORS.error,
          "❌ ",
          releasesSummaryResult.error.message,
        );
        process.exitCode = 1;
        return;
      }
      console.log(
        LOG_COLORS.error,
        "❌ ",
        "An unexpected error occurred: ",
        releasesSummaryResult.error,
      );
      process.exitCode = 1;
      return;
    }

    if (Object.keys(releasesSummaryResult.value.releases).length === 0) {
      console.log(
        LOG_COLORS.warn,
        "No releases found locally. Have you forgotten to pull?",
      );
      return;
    }

    console.log(LOG_COLORS.log, "Available releases:");
    for (const release of Object.keys(releasesSummaryResult.value.releases)) {
      const contracts = releasesSummaryResult.value.releases[release];
      console.log(LOG_COLORS.log, ` - ${release}`);
      if (contracts.length === 0) {
        console.log(LOG_COLORS.warn, "   No new or updated contracts found");
        continue;
      }
      for (const contract of contracts) {
        const [contractPath, contractName] = contract.split(":");
        console.log(LOG_COLORS.log, `   - ${contractName} (${contractPath})`);
      }
    }
  });

program
  .command("diff-with-latest")
  .description("Compare the current compilation with the latest release")
  .action(async (opts) => {
    const optsParsingResult = z
      .object({
        debug: z.boolean().default(false),
      })
      .safeParse(opts);
    if (!optsParsingResult.success) {
      console.log(LOG_COLORS.error, "❌ Invalid arguments");
      process.exitCode = 1;
      return;
    }

    console.log(
      LOG_COLORS.log,
      "\nComparing the current compilation with the latest release",
    );

    const differencesResult = await toAsyncResult(
      generateDiffWithLatest({ debug: optsParsingResult.data.debug }),
    );
    if (!differencesResult.success) {
      if (differencesResult.error instanceof ScriptError) {
        console.log(LOG_COLORS.error, "❌ ", differencesResult.error.message);
        process.exitCode = 1;
        return;
      }
      console.log(
        LOG_COLORS.error,
        "❌ An unexpected error occurred: ",
        differencesResult.error,
      );
      process.exitCode = 1;
      return;
    }

    if (differencesResult.value.length === 0) {
      console.log(LOG_COLORS.success, "\nNo differences found");
      return;
    }

    console.log(LOG_COLORS.success, "\nDifferences found:");
    for (const difference of differencesResult.value) {
      console.log(
        LOG_COLORS.success,
        ` - ${difference.name} (${difference.path}): ${difference.status}`,
      );
    }
  });

program
  .command("generate-typings")
  .description("Generate typings based on the existing releases")
  .option(
    "--no-filter",
    "Do not filter similar contract in subsequent releases",
  )
  .action(async (args) => {
    const parsingResult = z
      .object({
        filter: z.boolean(),
        debug: z.boolean().default(false),
      })
      .safeParse(args);

    if (!parsingResult.success) {
      console.error(LOG_COLORS.error, "❌ Invalid arguments");
      process.exitCode = 1;
      return;
    }

    console.log(
      LOG_COLORS.log,
      `\nStarting typings generation. ${
        parsingResult.data.filter
          ? "Similar contracts in subsequent releases will be filtered."
          : "All contracts for all releases will be considered"
      }`,
    );

    console.log("\n");

    await generateReleasesSummary(parsingResult.data.filter, {
      debug: parsingResult.data.debug,
    }).catch((err) => {
      if (err instanceof ScriptError) {
        console.log(LOG_COLORS.error, "❌ ", err.message);
        process.exitCode = 1;
        return;
      }
      console.log(LOG_COLORS.error, "❌ An unexpected error occurred: ", err);
      process.exitCode = 1;
    });

    console.log(LOG_COLORS.success, "\nTypings generated successfully\n");
  });

program.parse(process.argv);
