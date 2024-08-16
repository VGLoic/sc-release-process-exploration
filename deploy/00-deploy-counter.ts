import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { contract, getReleaseBuildInfo } from "../.soko-typings";
import { verifyContract } from "../scripts/utils";
import { ethers } from "ethers";

const TARGET_RELEASE = "v1.4.5";

const deployCounter: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();

  const balance = await hre.ethers.provider.getBalance(deployer);

  console.log("Deploying contracts with account: ", {
    address: deployer,
    balance: ethers.formatEther(balance),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestBuildInfo: any = await getReleaseBuildInfo(TARGET_RELEASE).catch(
    (error) => {
      console.error("Error getting build info", error);
      process.exit(1);
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const incrementOracleArtifact: any = await contract(
    "src/IncrementOracle.sol:IncrementOracle",
  ).getArtifact(TARGET_RELEASE);

  const incrementOracleDeployment = await hre.deployments.deploy(
    `IncrementOracle@${TARGET_RELEASE}`,
    {
      contract: {
        abi: incrementOracleArtifact.abi,
        bytecode: incrementOracleArtifact.evm.bytecode.object,
        metadata: incrementOracleArtifact.metadata,
      },
      from: deployer,
      log: true,
    },
  );

  if (hre.network.verify) {
    await verifyContract({
      address: incrementOracleDeployment.address,
      sourceCode: latestBuildInfo.input,
      compilerVersion: latestBuildInfo.solcLongVersion,
      sourceName: "src/IncrementOracle.sol",
      contractName: "IncrementOracle",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const counterArtifact: any = await contract(
    "src/Counter.sol:Counter",
  ).getArtifact(TARGET_RELEASE);
  const counterDeployment = await hre.deployments.deploy(
    `Counter@${TARGET_RELEASE}`,
    {
      contract: {
        abi: counterArtifact.abi,
        bytecode: counterArtifact.evm.bytecode.object,
        metadata: counterArtifact.metadata,
      },
      libraries: {
        "src/IncrementOracle.sol:IncrementOracle":
          incrementOracleDeployment.address,
      },
      from: deployer,
      log: true,
    },
  );

  if (hre.network.verify) {
    await verifyContract({
      address: counterDeployment.address,
      sourceCode: latestBuildInfo.input,
      compilerVersion: latestBuildInfo.solcLongVersion,
      sourceName: "src/Counter.sol",
      contractName: "Counter",
      libraries: [
        {
          address: incrementOracleDeployment.address,
          sourceName: "src/IncrementOracle.sol",
          contractName: "IncrementOracle",
        },
      ],
    });
  }
};

export default deployCounter;
