import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import 'hardhat-deploy'
import 'dotenv/config'
import { config as baseConfig } from './hardhat.config';

const config: HardhatUserConfig = {
  ...baseConfig,
  paths: {
    ...baseConfig.paths,
    artifacts: `./releases/tmp/artifacts`,
  },
  typechain: {
    outDir: `releases/tmp/typechain`,
  },
}

export default config
