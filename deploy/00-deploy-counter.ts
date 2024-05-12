import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { contract } from "../scripts/v2/artifacts";

const deployCounter: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();

  const incrementOracleArtifact = await contract(
    "src/IncrementOracle.sol/IncrementOracle",
  ).getArtifact("latest");
  const incrementOracleDeployment = await hre.deployments.deploy(
    "IncrementOracle@latest",
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

  const counterArtifact = await contract("src/Counter.sol/Counter").getArtifact(
    "latest",
  );
  await hre.deployments.deploy("Counter@latest", {
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
  });
};
export default deployCounter;
