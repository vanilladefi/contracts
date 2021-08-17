import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/dist/types"

const func: DeployFunction = async function ({ deployments, network }: HardhatRuntimeEnvironment) {
  const { getOrNull } = deployments

  const existingDeployment = await getOrNull("UniswapV3Factory")
  if (!existingDeployment) {
    if (!(network.name === "localhost" || network.name === "hardhat")) {
      throw new Error(`UniswapV3Factory should've been deployed in "${network.name}", check the deployments`)
    }
    throw new Error("Fix me for tests")
  }
}
func.tags = ["UniswapV3Factory"]
func.dependencies = ["WETH9"]
export default func
