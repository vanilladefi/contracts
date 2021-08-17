import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/dist/types"
import UniswapV2Router02 from "@uniswap/v2-periphery/build/UniswapV2Router02.json"
import ERC20 from "@uniswap/v2-periphery/build/ERC20.json"

const func: DeployFunction = async function ({ ethers, deployments, getNamedAccounts, network }: HardhatRuntimeEnvironment) {
  const { deploy, getOrNull, get, execute } = deployments

  const { deployer } = await getNamedAccounts()
  const { MaxUint256 } = ethers.constants

  const existingDeployment = await getOrNull("UniswapV2Router02")
  if (!existingDeployment) {
    if (!(network.name === "localhost" || network.name === "hardhat")) {
      throw new Error(`UniswapV2Router02 should've been deployed in "${network.name}", check the deployments`)
    }
    const { address: wethAddress } = await get("WETH9")
    const { address: factoryAddress } = await get("UniswapV2Factory")
    const { address: routerAddress } = await deploy("UniswapV2Router02", {
      from: deployer,
      args: [factoryAddress, wethAddress],
      contract: UniswapV2Router02,
      log: true,
    })
    // let's add some mock tokens and liquidity
    const deployAndAddLiquidity = async (symbol: string) => {
      let bn = ethers.BigNumber.from
      let { address } = await deploy(symbol, {
        from: deployer,
        args: [bn(10000n * (10n ** 18n))],
        contract: ERC20,
      })
      let tokenLiquidity = bn(500n * (10n ** 18n))
      let wethLiquidity = bn(500n * (10n ** 18n))
      await execute(symbol, {
        from: deployer,
      },
      "approve", routerAddress, tokenLiquidity)
      await execute("UniswapV2Router02", {
        from: deployer,
        value: wethLiquidity,
      }, "addLiquidityETH", address, tokenLiquidity, tokenLiquidity, wethLiquidity, deployer, MaxUint256)
    }
    await deployAndAddLiquidity("AAA")
    await deployAndAddLiquidity("BBB")
    await deployAndAddLiquidity("CCC")
  }
}
func.dependencies = ["WETH9", "UniswapV2Factory"]
func.tags = ["UniswapV2Router02"]
export default func
