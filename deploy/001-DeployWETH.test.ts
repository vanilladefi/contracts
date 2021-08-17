import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/dist/types"
import WETH9 from "@uniswap/v2-periphery/build/WETH9.json"

const func: DeployFunction = async function ({ deployments, getNamedAccounts, network }: HardhatRuntimeEnvironment) {
  const { deploy, getOrNull } = deployments

  const { deployer } = await getNamedAccounts()

  const existingDeployment = await getOrNull("WETH9")
  if (!existingDeployment) {
    if (!(network.name === "localhost" || network.name === "hardhat")) {
      throw new Error(`WETH9 should've been deployed in "${network.name}", check the deployments`)
    }
    await deploy("WETH9", {
      from: deployer,
      contract: WETH9,
      log: true,
    })
  }
}
func.tags = ["WETH9"]
export default func
