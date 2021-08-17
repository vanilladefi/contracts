import { HardhatRuntimeEnvironment } from "hardhat/types"

export default async (_: never, { ethers }: HardhatRuntimeEnvironment): Promise<void> => {
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
}
