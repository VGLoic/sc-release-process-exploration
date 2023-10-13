import { BuildInfo, HardhatRuntimeEnvironment } from 'hardhat/types'
import { ArtifactData, DeployOptions } from 'hardhat-deploy/dist/types'
import { Etherscan } from "@nomicfoundation/hardhat-verify/etherscan";

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

function sleep(seconds: number) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

type VerifyPayload = {
    address: string
    artifact: ArtifactData & {
        sourceName: string
        contractName: string
    }
    buildInfo: BuildInfo
}
export async function verifyContract(payload: VerifyPayload) {
    
    // ******************* End disabling *******************
    for (let i = 0; i < 5; i++) {
      try {
        await verifyContractOnce(payload)
        return
      } catch (err) {
        const message = (err as any).message as string
        if (message && message.includes('does not have bytecode')) {
          await sleep(2)
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
    
        await sleep(2);
    
        const verificationStatus = await etherscan.getVerificationStatus(guid);
    
        if (verificationStatus.isSuccess()) {
            console.log("Successfully verified!");
        } else {
            console.log("Failed to verify?");
            console.log(verificationStatus);
        }
    } catch (err) {
        throw err;
    }
    
  }

