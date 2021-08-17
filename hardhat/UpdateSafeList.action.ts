/* eslint-disable camelcase */
import { HardhatRuntimeEnvironment, Network } from "hardhat/types"
import { VanillaV1Safelist01__factory } from "../typechain/vanilla_v1.1"
import { SafeLedgerSigner } from "../utils/SafeLedgerSigner.util"
import { safeListV1_02 } from "../utils/safelists"
import { HardhatEthersHelpers } from "hardhat-deploy-ethers/dist/src/types"

const initialSafeList = (network: Network) => {
  switch (network.config.chainId) {
    case 1: return safeListV1_02.map(pool => pool.address)
    case 4: return ["0xdc588526bbfd072d0c632a92b25419e59267d0ab"]
    default: return []
  }
}

const deployingSigner = async (ethers: HardhatEthersHelpers, network: Network) => {
  console.log(network)
  if (network.name === "mainnet" || network.name === "rinkeby") {
    return await SafeLedgerSigner(ethers.provider, network)
  }
  return await ethers.getNamedSigner("deployer")
}

export default async (_: never, { ethers, deployments, network }: HardhatRuntimeEnvironment): Promise<void> => {
  const { get } = deployments

  let { address: safelist } = await get("VanillaV1Safelist01") // throws if safelist not deployed

  let signer = await deployingSigner(ethers, network)

  let vanillaV1Safelist01 = VanillaV1Safelist01__factory.connect(safelist, signer)

  let added = initialSafeList(network)
  console.log(`updateSafelist(added=${added}) - sign the transaction in Ledger`)
  let pendingTx = await vanillaV1Safelist01.connect(signer).modify(added, [])
  console.log("Safelist update tx waiting in Safe for approval and execution")
  let receipt = await pendingTx.wait()
  console.log(`Safelist updated in #${receipt.blockNumber}`)
  console.log(`Gas usage: ${receipt.gasUsed}`)
}
