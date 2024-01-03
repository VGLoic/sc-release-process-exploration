import { BuildInfo, HardhatRuntimeEnvironment } from 'hardhat/types'
import { ArtifactData, DeployOptions } from 'hardhat-deploy/dist/types'
import { Etherscan } from "@nomicfoundation/hardhat-verify/etherscan";

/**
 * Retrieve an existing deployment or deploy a new one
 * A deployment is considered existing if the contract bytecode is the same than the current one
 * @param hre Hardhat runtime environment
 * @param deploymentName Name of the deployment
 * @param options Deployment options
 * @returns Address of the deployed contract
 */
export async function retrieveOrDeploy(hre: HardhatRuntimeEnvironment, deploymentName: string, options: DeployOptions) {
    const result = await hre.deployments.fetchIfDifferent(deploymentName, options)
    if (!result.differences && result.address) {
      console.log(
        `\n✔️ The deployment ${deploymentName} is known, deployed contract is found at address ${result.address}. Re-using it.\n`
      )
      return result.address
    }
  
    console.log(`\n This version of the ${deploymentName} has not been deployed. Deploying it. \n`)
    const deploymentResult = await hre.deployments.deploy(deploymentName, options)
    console.log(
      `\n✔️ The deployment ${deploymentName} has been successfully realised, the deployed contract can be found at address ${deploymentResult.address} \n`
    )
    return deploymentResult.address
}

/**
 * Sleep for a given amount of time
 * @param ms Milliseconds to sleep
 */
function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

type VerifyPayload = {
    // Address of the deployed contract
    address: string
    // Contract artifact with source name and contract name
    artifact: ArtifactData & {
        sourceName: string
        contractName: string
    }
    // Build info of the associated contract artifact
    buildInfo: BuildInfo
    // Libraries if any
    libraries?: {
        address: string;
        artifact: ArtifactData & {
            sourceName: string;
            contractName: string;
        };
      }[]
}
/**
 * Verify a contract on Etherscan
 * @dev Only works for Polygon Scan on Mumbai Testnet for now
 * @dev Need to be completed with constructor arguments
 * @param payload Verification payload
 * @param payload.address Address of the deployed contract
 * @param payload.artifact Contract artifact with source name and contract name
 * @param payload.buildInfo Build info of the associated contract artifact
 * @param payload.libraries Libraries if any
 */
export async function verifyContract(payload: VerifyPayload) {
  const updatedSetting: BuildInfo["input"]["settings"] & { libraries: NonNullable<BuildInfo["input"]["settings"]["libraries"]> } = {
    ...payload.buildInfo.input.settings,
    libraries: {},
  };

    if (payload.libraries) {
      for (const library of payload.libraries) {
        updatedSetting.libraries[library.artifact.sourceName] = {
          [library.artifact.contractName]: library.address
        };
      }
    }

    const updatedBuildInfo: BuildInfo = {
      ...payload.buildInfo,
      input: {
        ...payload.buildInfo.input,
        settings: updatedSetting,
      },
    };
    payload.buildInfo = updatedBuildInfo;
    
    // ******************* End disabling *******************
    for (let i = 0; i < 5; i++) {
      try {
        await verifyContractOnce(payload)
        return
      } catch (err) {
        const message = (err as any).message as string
        if (message && message.includes('does not have bytecode')) {
          await sleep(2_000)
          continue
        }
  
        if (message) {
          console.error(
            `\n⚠️ Verification of ${payload.artifact.contractName} fails. \nIf fail happens because the data is not yet available on the block explorer, feel free to re-trigger the script in a few seconds in order to try to verify again.\n Actual error: `,
            message
          )
          return
        }
      }
    }
  }
  
  async function verifyContractOnce(
    payload: VerifyPayload
  ) {
    const apiKey = process.env.POLYGON_SCAN_API_KEY;
    if (!apiKey) {
        throw new Error("Missing API key for verification");
    }
    const etherscan = new Etherscan(
        apiKey,
        "https://api-testnet.polygonscan.com/api",
        "https://mumbai.polygonscan.com/"
    )

    const isVerified = await etherscan.isVerified(payload.address);
    
    if (isVerified) {
        console.log("Wunderbar, it's already verified!");
        return;
    }

    try {
        const { message: guid} = await etherscan.verify(
            // Contract address
            payload.address,
            // Inputs
            JSON.stringify(payload.buildInfo.input),
            // Contract full name
            `${payload.artifact.sourceName}:${payload.artifact.contractName}`,
            // Compiler version
            `v${payload.buildInfo.solcLongVersion}`,
            // Encoded constructor arguments
            ''
        );
    
        await sleep(2_000);
    
        const verificationStatus = await etherscan.getVerificationStatus(guid);
    
        if (verificationStatus.isSuccess()) {
            console.log(`Successfully verified contract ${payload.artifact.contractName}`);
        } else {
            throw new Error(verificationStatus.message);
        }
    } catch (err) {
        throw err;
    }
  }

