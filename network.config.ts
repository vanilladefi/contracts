import Env from "dotenv"
import { Network } from "hardhat/types"

Env.config({ path: "./.secrets.env" })

export type SupportedNetwork = "mainnet" | "ropsten" | "goerli" | "rinkeby"
export type NetworkConfig = {
  providerURL: string,
  privateKeys?: string[],
  gnosisTxService?: string,
  hdPath?: string,
  multisigAddress?: string,
}
export const getNetworkConfig = (network: Network): NetworkConfig | undefined => {
  switch (network.name) {
    case "mainnet":
    case "goerli":
    case "rinkeby":
    case "ropsten":
      return Networks[network.name]
    default:
      return undefined
  }
}
export const Networks: Record<SupportedNetwork, NetworkConfig> = {
  mainnet: {
    providerURL: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_MAINNET_APIKEY}`,
    privateKeys: process.env.MAINNET_DEPLOYER_PRIVATE_KEY ? [`0x${process.env.MAINNET_DEPLOYER_PRIVATE_KEY}`] : undefined,
    hdPath: process.env.MAINNET_DEPLOYER_HDPATH,
    gnosisTxService: "https://safe-transaction.mainnet.gnosis.io",
    multisigAddress: process.env.MAINNET_DEPLOYER_ADDRESS,
  },
  ropsten: {
    providerURL: `https://eth-ropsten.alchemyapi.io/v2/${process.env.ALCHEMY_ROPSTEN_APIKEY}`,
    privateKeys: process.env.ROPSTEN_DEPLOYER_PRIVATE_KEY ? [`0x${process.env.ROPSTEN_DEPLOYER_PRIVATE_KEY}`] : undefined,
    hdPath: process.env.ROPSTEN_DEPLOYER_HDPATH,
  },
  goerli: {
    providerURL: `https://eth-goerli.alchemyapi.io/v2/${process.env.ALCHEMY_GOERLI_APIKEY}`,
    privateKeys: process.env.GOERLI_DEPLOYER_PRIVATE_KEY ? [`0x${process.env.GOERLI_DEPLOYER_PRIVATE_KEY}`] : undefined,
    hdPath: process.env.GOERLI_DEPLOYER_HDPATH,
  },
  rinkeby: {
    providerURL: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_RINKEBY_APIKEY}`,
    privateKeys: process.env.RINKEBY_DEPLOYER_PRIVATE_KEY ? [`0x${process.env.RINKEBY_DEPLOYER_PRIVATE_KEY}`] : undefined,
    gnosisTxService: "https://safe-transaction.rinkeby.gnosis.io",
    hdPath: process.env.RINKEBY_DEPLOYER_HDPATH,
    multisigAddress: process.env.RINKEBY_DEPLOYER_ADDRESS,
  },
}
