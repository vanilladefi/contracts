import Env from "dotenv"

Env.config({ path: "./.secrets.env" })

export const NETWORKS = {
  MAINNET: {
    URL: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_MAINNET_APIKEY}`,
    ACCOUNTS: process.env.MAINNET_DEPLOYER_PRIVATE_KEY ? [`0x${process.env.MAINNET_DEPLOYER_PRIVATE_KEY}`] : undefined,
  },
  ROPSTEN: {
    URL: `https://eth-ropsten.alchemyapi.io/v2/${process.env.ALCHEMY_ROPSTEN_APIKEY}`,
    ACCOUNTS: process.env.ROPSTEN_DEPLOYER_PRIVATE_KEY ? [`0x${process.env.ROPSTEN_DEPLOYER_PRIVATE_KEY}`] : undefined,
  },
  GOERLI: {
    URL: `https://eth-goerli.alchemyapi.io/v2/${process.env.ALCHEMY_GOERLI_APIKEY}`,
    ACCOUNTS: process.env.GOERLI_DEPLOYER_PRIVATE_KEY ? [`0x${process.env.GOERLI_DEPLOYER_PRIVATE_KEY}`] : undefined,
  },
}
