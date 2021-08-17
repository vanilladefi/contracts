/* eslint-disable camelcase */
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/dist/types"
import {
  VanillaV1MigrationState__factory,
  VanillaV1Router02__factory,
  VanillaV1Safelist01__factory,
} from "../typechain/vanilla_v1.1"
import { SafeLedgerSigner } from "../utils/SafeLedgerSigner.util"
import { connectUsing } from "../utils/DeploymentTools"

const func: DeployFunction = async function ({ ethers, deployments, network }: HardhatRuntimeEnvironment) {
  const { getOrNull, get, save } = deployments

  const connect = connectUsing(ethers.provider)
  const existingDeployment = await getOrNull("VanillaV1Router02")
  if (!existingDeployment) {
    let { address: peripheryState } = await get("UniswapV3SwapRouter")
    let { address: v1 } = await get("VanillaV1Router01")

    let receipt
    if (network.name === "localhost" || network.name === "hardhat") {
      let signer = await ethers.getNamedSigner("deployer")
      let contractDeployment = new VanillaV1Router02__factory(signer).getDeployTransaction(peripheryState, v1)
      let pendingTransaction = await signer.sendTransaction(contractDeployment)
      receipt = await pendingTransaction.wait()
    } else {
      let safeSigner = await SafeLedgerSigner(ethers.provider, network)
      let contractDeployment = new VanillaV1Router02__factory(safeSigner).getDeployTransaction(peripheryState, v1)
      console.log("Deploying VanillaV1Router02 - sign the transaction in Ledger")
      let pendingTransaction = await safeSigner.sendTransaction(contractDeployment)
      console.log("Deployment waiting in Safe for approval and execution")
      receipt = await pendingTransaction.wait()
      console.log("Deployment done", receipt)
    }

    let address = receipt.contractAddress
    await save("VanillaV1Router02", {
      abi: VanillaV1Router02__factory.abi,
      address,
      receipt,
    })
    let router = connect.router(address)
    let [safeList, migrationState] = await Promise.all([
      router.safeList().then(connect.safelist),
      router.vnlContract().then(connect.vnlToken).then(vnl => vnl.migrationState()).then(connect.migrationState),
    ])
    await save("VanillaV1Safelist01", {
      abi: VanillaV1Safelist01__factory.abi,
      address: safeList.address,
    })
    await save("VanillaV1MigrationState", {
      abi: VanillaV1MigrationState__factory.abi,
      address: migrationState.address,
    })
    console.log("Deployed contracts", { router: address, safelist: safeList.address, migrationState: migrationState.address })
    console.log(`Gas usage: ${receipt.gasUsed}`)
  }
}
func.dependencies = ["UniswapV3SwapRouter", "VanillaV1Router01"]
func.tags = ["VanillaV1Router02", "VanillaV1Safelist01", "VanillaV1MigrationState"]
export default func
