import { NETWORKS } from "./network.config"
import { HardhatUserConfig, task } from "hardhat/config"

import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import UniswapPair from "@uniswap/v2-core/build/IUniswapV2Pair.json"
import VanillaRouter from "./artifacts/contracts/VanillaRouter.sol/VanillaRouter.json"

task("check-epoch", "Checks the epoch of the deployed VanillaRouter", async (_, { network, ethers, deployments }) => {
  const { get } = deployments

  try {
    console.log(`Checking VanillaRouter deployment in '${network.name}':`)
    let {address} = await get("VanillaRouter")
    let router = new ethers.Contract(address, VanillaRouter.abi, await ethers.getNamedSigner("deployer"))
    let epoch = await router.epoch()
    console.log(`VanillaRouter deployed in ${address}, at block ${epoch.toNumber()}`)
  }
  catch (e) {
    console.error(e)
  }
})

task("test-accounts", "Prints the list of test accounts", async (_, { ethers }) => {
  // creates a BIP-32 path with 5 levels as defined in BIP-44
  const hdpath = (index: number) => `m/44'/60'/0'/0/${index}`
  // Hardhat's default as defined in https://hardhat.org/config/#hardhat-network
  const DEFAULT_TEST_MNEMONIC = "test test test test test test test test test test test junk"

  let accounts = []
  for (let index = 0; index < 20; index++) {
    let { address, privateKey } = ethers.Wallet.fromMnemonic(DEFAULT_TEST_MNEMONIC, hdpath(index))
    accounts.push({ address, privateKey })
  }
  console.table(accounts)
})

task("reserve-check", "checks the Uniswap pair reserves in the network", async (_, { ethers, deployments }) => {
  // mainnet WBTC-WETH UNI-V2 pair https://etherscan.io/address/0xbb2b8038a1640196fbe3e38816f3e67cba72d940
  let wethBtc = "0xbb2b8038a1640196fbe3e38816f3e67cba72d940"
  let pair = new ethers.Contract(wethBtc, UniswapPair.abi, ethers.getDefaultProvider())
  let { reserve0, reserve1 } = await pair.getReserves()

  console.log("WBTC-WETH reserves:", BigInt(reserve0.toHexString()), BigInt(reserve1.toHexString()))
})

let isMainnetFork = process.env.FORK === "mainnet"
let localChainId = isMainnetFork ? 1 : 31337

// You have to export an object to set up your config
// This object can have the following optional entries:
// defaultNetwork, networks, solc, and paths.
// Go to https://buidler.dev/config/ to learn more
const hardhatConfig: HardhatUserConfig = {
  // This is a sample solc configuration that specifies which version of solc to use
  solidity: {
    version: "0.6.8",
    settings: {
      optimizer: {
        enabled: true,
      },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    mainnet: {
      url: NETWORKS.MAINNET.URL,
      accounts: NETWORKS.MAINNET.ACCOUNTS,
      live: true,
      gasPrice: 120 * 1_000_000_000,
      chainId: 1,
    },
    ropsten: {
      url: NETWORKS.ROPSTEN.URL,
      accounts: NETWORKS.ROPSTEN.ACCOUNTS,
      live: true,
      saveDeployments: true,
      chainId: 3,
    },
    goerli: {
      url: NETWORKS.GOERLI.URL,
      accounts: NETWORKS.GOERLI.ACCOUNTS,
      live: true,
      saveDeployments: true,
      chainId: 5,
    },
    localhost: {
      chainId: localChainId,
      live: false,
      saveDeployments: true,
      tags: ["local"],
    },
    hardhat: {
      forking: {
        enabled: isMainnetFork,
        url: NETWORKS.MAINNET.URL,
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
    dev: {
      default: 1, // the second account for mnemonic
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
}

export default hardhatConfig
