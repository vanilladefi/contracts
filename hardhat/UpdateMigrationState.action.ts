import { HardhatRuntimeEnvironment, Network } from "hardhat/types"
import {
  VanillaV1API01__factory,
  VanillaV1MigrationState__factory,
  VanillaV1Router02__factory,
  VanillaV1Token01__factory,
  VanillaV1Token02__factory,
} from "../typechain/vanilla_v1.1"
import { snapshot } from "../utils/conversion.util"
import { SafeLedgerSigner } from "../utils/SafeLedgerSigner.util"
import { HardhatEthersHelpers } from "hardhat-deploy-ethers/dist/src/types"

const deployingSigner = async (ethers: HardhatEthersHelpers, network: Network) => {
  if (network.name === "mainnet" || network.name === "rinkeby") {
    return await SafeLedgerSigner(ethers.provider, network)
  }
  return await ethers.getNamedSigner("deployer")
}

export default async (_: never, { ethers, deployments, network }: HardhatRuntimeEnvironment): Promise<void> => {
  const { get } = deployments

  let { address: migrationState } = await get("VanillaV1MigrationState") // throws if migration state not deployed
  let { address: router01 } = await get("VanillaV1Router01")
  let { address: router02 } = await get("VanillaV1Router02")

  let vnlV1token = await VanillaV1API01__factory.connect(router01, ethers.provider).vnlContract()
  let vanillaV1Token01 = VanillaV1Token01__factory.connect(vnlV1token, ethers.provider)
  let vanillaV1Token02 = await VanillaV1Router02__factory.connect(router02, ethers.provider).vnlContract().then(addr => VanillaV1Token02__factory.connect(addr, ethers.provider))
  let { pending } = await snapshot(vanillaV1Token01, vanillaV1Token02)

  let signer = await deployingSigner(ethers, network)

  let vanillaV1MigrationState = new VanillaV1MigrationState__factory(signer).attach(migrationState)
  console.log(`updateConvertibleState(root=${pending.root}, bn=${pending.state.blockNumber}) - sign the transaction in Ledger`)
  let pendingTx1 = await vanillaV1MigrationState.connect(signer).updateConvertibleState(pending.root, pending.state.blockNumber)
  console.log("Migration state update tx waiting in Safe for approval and execution")
  let receipt = await pendingTx1.wait()
  console.log(`Migration state updated in #${receipt.blockNumber}, next deadline`, await vanillaV1MigrationState.conversionDeadline().then(bn => new Date(bn.toNumber() * 1000).toISOString()))
  console.log(`Gas usage: ${receipt.gasUsed}`)
}
