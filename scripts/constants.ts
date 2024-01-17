import path from "node:path";

// Releases folder
export const RELEASES_FOLDER = path.join(__dirname, "../../releases");
// Generated delta releases folder
export const GENERATED_DELTA_FOLDER = path.join(
  RELEASES_FOLDER,
  "generated-delta",
);
export const GENERATED_DELTA_CONTRACTS_ARTIFACTS_FOLDER = path.join(
  GENERATED_DELTA_FOLDER,
  "contracts",
);
export const GENERATED_DELTA_BUILD_INFOS_ARTIFACTS_FOLDER = path.join(
  GENERATED_DELTA_FOLDER,
  "build-infos",
);
// Snapshots releases folder
export const SNAPSHOTS_RELEASES_FOLDER = path.join(
  RELEASES_FOLDER,
  "snapshots",
);

// Final `dist` folder of bundled artifacts
export const DIST_FOLDER = path.join(__dirname, "../../dist");

// Tmp folder used by the hardhat compilation
export const RELEASES_TMP_FOLDER = path.join(RELEASES_FOLDER, "tmp");
