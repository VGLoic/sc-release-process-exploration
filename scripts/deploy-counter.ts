import hre from 'hardhat'
import { ArtifactData, } from 'hardhat-deploy/dist/types'
import { retrieveOrDeploy, verifyContract } from './utils';

import CounterArtifactsV1 from '../releases/v0.0.1/artifacts/src/Counter.sol/Counter.json';
import CounterArtifactsV2 from '../releases/v0.0.2/artifacts/src/Counter.sol/Counter.json';

import BuildInfoV1 from '../releases/v0.0.1/artifacts/build-info/fc5d18213eb3a8a9eea316f67cf71c85.json';
import BuildInfoV2 from '../releases/v0.0.2/artifacts/build-info/7d673508b76736cd45e49d3b312963d8.json';
import { BuildInfo } from 'hardhat/types';

const RELEASE = process.env.RELEASE_NAME;

const artifacts: Record<string, {contract: ArtifactData & {
  sourceName: string
  contractName: string
}, buildInfo: BuildInfo }> = {
    'v0.0.1': {
      contract: CounterArtifactsV1,
      buildInfo: BuildInfoV1
    },
    'v0.0.2': {
      contract: CounterArtifactsV2,
      buildInfo: BuildInfoV2,
    }
}

async function main() {
    const { deployer } = await hre.getNamedAccounts()
    if (!deployer) {
        console.error('❌ Deployer account not found')
        process.exit(1)
    }

    const artifact = artifacts[RELEASE || ''];
    if (!artifact) {
        console.error('❌ Release not found')
        process.exit(1)
    }

    const deploymentName = `Counter-${RELEASE}`;
    const counterAddress = await retrieveOrDeploy(hre, deploymentName, {
        contract: artifact.contract,
        from: deployer,
        args: [],
        log: true,
    });

    await verifyContract({
      address: counterAddress,
      artifact: artifact.contract,
      buildInfo: artifact.buildInfo
    })
}

main()

