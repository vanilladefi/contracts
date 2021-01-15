import { ethers, waffle } from "hardhat"
import { Contract, Wallet, BigNumber, constants, Signer } from "ethers"

import UniswapV2Router02 from "@uniswap/v2-periphery/build/UniswapV2Router02.json"
import UniswapV2Factory from "@uniswap/v2-core/build/UniswapV2Factory.json"
import IUniswapV2Pair from "@uniswap/v2-core/build/IUniswapV2Pair.json"
import WETH9 from "@uniswap/v2-periphery/build/WETH9.json"
import ERC20 from "@uniswap/v2-periphery/build/ERC20.json"

const { MaxUint256 } = constants
const { deployContract, provider } = waffle

export const ethInWei = (n: number): BigNumber => {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

export const deployTokens = async (wallet: Wallet) => {
  const tokenA = await deployContract(wallet, ERC20, [ethInWei(10000)])
  const tokenB = await deployContract(wallet, ERC20, [ethInWei(10000)])
  const WETH = await deployContract(wallet, WETH9)
  return { tokenA, tokenB, WETH }
}

const createLiquidityETH = async (tokenOwner: Signer, router: Contract, token: Contract, weth: Contract, overrides = { gasLimit: 9999999 }) => {
  let tokenAmount = 50000
  let wethAmount = ethInWei(500)
  await token.connect(tokenOwner).approve(router.address, MaxUint256)
  return await router.connect(tokenOwner).addLiquidityETH(token.address, tokenAmount, tokenAmount, wethAmount, await tokenOwner.getAddress(), MaxUint256, {
    ...overrides,
    value: wethAmount,
  })
}

const deployUniswap = async (uniswapOwner: Signer, WETH: Contract, overrides = {}) => {
  const factory = await deployContract(uniswapOwner, UniswapV2Factory, [await uniswapOwner.getAddress()])
  const router = await deployContract(uniswapOwner, UniswapV2Router02, [factory.address, WETH.address], overrides)
  return { factory, router }
}

const createPair = async (uniswapOwner: Signer, factory: Contract, tokenA: Contract, tokenB: Contract) => {
  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = new ethers.Contract(pairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(uniswapOwner)
  await pair.deployed()
  return { pair }
}

const setupUniswap = async (uniswapOwner: Signer, weth: Contract, targetAsset: Contract) => {
  let { factory, router } = await deployUniswap(uniswapOwner, weth)
  console.log("Deployed Uniswap contracts", factory.address, router.address, weth.address)

  let { pair } = await createPair(uniswapOwner, factory, weth, targetAsset)
  console.log("Created Uniswap pair", pair.address)
  return { router, factory, pair }
}

export const logGasUsage = async (label: string, tx: any) => {
  const receipt = await tx.wait()
  console.log("| %s gas usage: %s", label, receipt.gasUsed.toString())
}

export const setupUniswapRouter = async (tester: Wallet, uniswapOwner: Signer, token: Contract, WETH: Contract) => {
  let { factory, router, pair } = await setupUniswap(uniswapOwner, WETH, token)
  await createLiquidityETH(token.signer, router, token, WETH)
  return {
    router,
    async reserves () {
      let [reserve0, reserve1] = await pair.getReserves()
      return { reserve0, reserve1 }
    },
    async buy (ethNum: number, price: number) {
      let ethAmount = ethInWei(ethNum)

      let tx = await router.connect(tester).swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,
        [WETH.address, token.address],
        tester.address,
        MaxUint256,
        { value: ethAmount },
      )
      await logGasUsage("Uniswap-buy", tx)
    },
    async sell (tokenNum: number, price: number) {
      await token.connect(tester).approve(router.address, tokenNum)
      let tx = await router.connect(tester).swapExactTokensForETHSupportingFeeOnTransferTokens(
        tokenNum,
        0,
        [token.address, WETH.address],
        tester.address,
        MaxUint256,
        {
          gasLimit: 9999999,
        },
      )
      await logGasUsage("Uniswap-sell", tx)
    },
  }
}
