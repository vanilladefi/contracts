/* eslint-disable camelcase */
import { Networks } from "./network.config"
import { HardhatUserConfig } from "hardhat/config"

import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import "@typechain/hardhat"
import "solidity-coverage"
import "@nomiclabs/hardhat-etherscan"

let isMainnetFork = process.env.FORK === "mainnet"
let localChainId = isMainnetFork ? 1 : 31337

// You have to export an object to set up your config
// This object can have the following optional entries:
// defaultNetwork, networks, solc, and paths.
// Go to https://buidler.dev/config/ to learn more
const hardhatConfig: HardhatUserConfig = {
  etherscan: {
    apiKey: process.env.ETHERSCAN_APIKEY,
  },
  typechain: {
    outDir: "typechain/vanilla_v1.1",
    target: "ethers-v5",
  },
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
      },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    mainnet: {
      url: Networks.mainnet.providerURL,
      accounts: Networks.mainnet.privateKeys,
      live: true,
      gasPrice: 200 * 1_000_000_000,
      chainId: 1,
    },
    ropsten: {
      url: Networks.ropsten.providerURL,
      accounts: Networks.ropsten.privateKeys,
      live: true,
      saveDeployments: true,
      chainId: 3,
    },
    goerli: {
      url: Networks.goerli.providerURL,
      accounts: Networks.goerli.privateKeys,
      live: true,
      saveDeployments: true,
      chainId: 5,
    },
    rinkeby: {
      url: Networks.rinkeby.providerURL,
      accounts: Networks.rinkeby.privateKeys,
      live: true,
      saveDeployments: true,
      chainId: 4,
    },
    localhost: {
      chainId: localChainId,
      live: false,
      saveDeployments: true,
      tags: ["local"],
    },
    hardhat: {
      hardfork: "london",
      gasPrice: "auto",
      forking: {
        enabled: isMainnetFork,
        url: Networks.mainnet.providerURL,
      },
      chainId: localChainId,
      live: false,
      saveDeployments: true,
      tags: ["test", "local"],
    },
  },
  namedAccounts: {
    deployer: {
      default: 0, // the first account for mnemonic/specific private key
    },
    team: {
      default: 1, // the second account for mnemonic
    },
    dev: {
      default: 2,
    },
  },
  external: {
    contracts: [
      {
        artifacts: "node_modules/@uniswap/v2-periphery/build/",
      },
      {
        artifacts: "node_modules/@uniswap/v2-core/build/",
      },
    ],
  },
  mocha: {
    timeout: 0,
  },
}

export default hardhatConfig
