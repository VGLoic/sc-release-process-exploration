import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import 'hardhat-deploy'
import 'dotenv/config'
import { config as baseConfig } from './hardhat.config';

const RELEASE_NAME = process.env.RELEASE_NAME || '0.0.0';

const config: HardhatUserConfig = {
  ...baseConfig,
  paths: {
    ...baseConfig.paths,
    artifacts: `./releases/v${RELEASE_NAME}/artifacts`,
  },
  typechain: {
    outDir: `releases/v${RELEASE_NAME}/typechain`,
  },
}

export default config
