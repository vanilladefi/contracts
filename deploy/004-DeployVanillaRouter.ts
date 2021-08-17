import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/dist/types"
import VanillaV1Router from "../test/v1-artifacts/VanillaRouter.json"

const func: DeployFunction = async function ({ ethers, deployments, getNamedAccounts, network }: HardhatRuntimeEnvironment) {
  const { deploy, get, log, getOrNull } = deployments

  const { deployer } = await getNamedAccounts()
  let bn = ethers.BigNumber.from

  const existingDeployment = await getOrNull("VanillaV1Router01")
  if (!existingDeployment) {
    if (!(network.name === "localhost" || network.name === "hardhat")) {
      throw new Error(`VanillaV1Router01 should've been deployed in "${network.name}", check the deployments`)
    }
    // local setup so just pick first 2 tokens to safelist
    let { address: tokenA } = await get("AAA")
    let { address: tokenB } = await get("BBB")
    const RESERVELIMIT_10ETH = bn(10n * (10n ** 18n))
    let { address: uniswapRouter } = await get("UniswapV2Router02")
    const { address } = await deploy("VanillaV1Router01", {
      from: deployer,
      args: [uniswapRouter, RESERVELIMIT_10ETH, [tokenA, tokenB]],
      contract: VanillaV1Router,
      log: true,
    })
    log(`VanillaRouter deployed in "${network.name}" at ${address}`)
  }
}
func.dependencies = ["UniswapV2Router02"]
export default func
