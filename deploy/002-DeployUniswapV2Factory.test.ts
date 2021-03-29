import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/dist/types"
import UniswapV2Factory from "@uniswap/v2-core/build/UniswapV2Factory.json"

const func: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
  const { deploy, getOrNull } = deployments

  const { deployer } = await getNamedAccounts()

  const existingDeployment = await getOrNull("UniswapV2Factory")
  if (!existingDeployment) {
    await deploy("UniswapV2Factory", {
      from: deployer,
      args: [deployer],
      contract: UniswapV2Factory,
      log: true,
    })
  }
}
func.tags = ["UniswapV2Factory"]
export default func
