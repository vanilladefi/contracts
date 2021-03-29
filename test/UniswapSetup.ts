import { ethers, waffle } from "hardhat"
import { Contract, Wallet, BigNumber, constants, Signer } from "ethers"

import UniswapV2Router02 from "@uniswap/v2-periphery/build/UniswapV2Router02.json"
import UniswapV2Factory from "@uniswap/v2-core/build/UniswapV2Factory.json"
import IUniswapV2Pair from "@uniswap/v2-core/build/IUniswapV2Pair.json"
import WETH9 from "@uniswap/v2-periphery/build/WETH9.json"
import ERC20 from "@uniswap/v2-periphery/build/ERC20.json"

const { MaxUint256 } = constants
const { deployContract, provider } = waffle

export type Erc20ish = bigint | BigNumber

export const tokenAmount = (n: number | string, exp = 18): BigNumber => {
  if (typeof n === "string") {
    return BigNumber.from(BigInt(n.replace(".", "")))
  }
  return BigNumber.from(BigInt(n) * 10n ** BigInt(exp))
}

export const deployTokens = async (wallet: Wallet) => {
  const tokenA = await deployContract(wallet, ERC20, [tokenAmount(10000)])
  const tokenB = await deployContract(wallet, ERC20, [tokenAmount(10000)])
  const WETH = await deployContract(wallet, WETH9)
  return { tokenA, tokenB, WETH }
}

export const createLiquidityETH = async (tokenOwner: Signer, router: Contract, token: Contract, weth: Contract) => {
  let tokenLiquidity = tokenAmount(500)
  let wethLiquidity = tokenAmount(500)
  await token.connect(tokenOwner).approve(router.address, MaxUint256)
  await router.connect(tokenOwner).addLiquidityETH(token.address, tokenLiquidity, tokenLiquidity, wethLiquidity, await tokenOwner.getAddress(), MaxUint256, {
    value: wethLiquidity,
  })
  return {
    tokenLiquidity,
    wethLiquidity,
  }
}

export const deployUniswap = async (uniswapOwner: Signer, WETH: Contract, overrides = {}) => {
  const factory = await deployContract(uniswapOwner, UniswapV2Factory, [await uniswapOwner.getAddress()])
  const router = await deployContract(uniswapOwner, UniswapV2Router02, [factory.address, WETH.address], overrides)
  return { factory, router }
}

export const createPair = async (uniswapOwner: Signer, factory: Contract, tokenA: Contract, tokenB: Contract) => {
  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = new ethers.Contract(pairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(uniswapOwner)
  await pair.deployed()
  return { pair }
}

export const setupUniswap = async (uniswapOwner: Signer, weth: Contract, targetAsset: Contract) => {
  let { factory, router } = await deployUniswap(uniswapOwner, weth)

  let { pair } = await createPair(uniswapOwner, factory, weth, targetAsset)
  return { router, factory, pair }
}

export const logGasUsage = async (label: string, tx: any) => {
  const receipt = await tx.wait()
  console.log("| %s gas usage: %s", label, receipt.gasUsed.toString())
}

const toBigint = (amount: Erc20ish): bigint => {
  if (typeof amount !== "bigint") {
    return BigInt(amount.toHexString())
  }
  return amount
}

const toBigNumber = (amount: Erc20ish): BigNumber => {
  if (typeof amount === "bigint") {
    return BigNumber.from(amount)
  }
  return amount
}
type swapInput = {tokensIn: bigint, reserveIn: bigint, reserveOut: bigint}

export const uniswapPrices = (weths: Erc20ish, tokens: Erc20ish) => ({
  wethReserve: toBigint(weths),
  tokenReserve: toBigint(tokens),
  swap ({ tokensIn, reserveIn, reserveOut } : swapInput) {
    let inMinusFee = tokensIn * 997n
    let tokensOut = reserveOut * inMinusFee / (reserveIn * 1000n + inMinusFee)
    return tokensOut
  },
  buy (numWeth: Erc20ish) {
    // we need to do these union types because funnily some mocha-reporters fail if the assertion fails _and_ the
    // expected types are bigint, because they are doing a JSON serialization round-trip (cannot serialize bigints whereas
    // ethers.BigNumbers are objects which are serializable ok)
    numWeth = toBigint(numWeth)
    let tokensOut = this.swap({ tokensIn: numWeth, reserveIn: this.wethReserve, reserveOut: this.tokenReserve })
    this.wethReserve += numWeth
    this.tokenReserve -= tokensOut
    return BigNumber.from(tokensOut)
  },
  sell (numTokens: Erc20ish) {
    numTokens = toBigint(numTokens)
    let wethsOut = this.swap({ tokensIn: numTokens, reserveIn: this.tokenReserve, reserveOut: this.wethReserve })
    this.wethReserve -= wethsOut
    this.tokenReserve += numTokens
    return BigNumber.from(wethsOut)
  },
})

export const setupUniswapRouter = async (tester: Wallet, uniswapOwner: Signer, token: Contract, WETH: Contract) => {
  let { factory, router, pair } = await setupUniswap(uniswapOwner, WETH, token)
  let { tokenLiquidity, wethLiquidity } = await createLiquidityETH(token.signer, router, token, WETH)
  return {
    tokenLiquidity,
    wethLiquidity,
    router,
    async reserves () {
      let [reserve0, reserve1] = await pair.getReserves()
      return { reserve0, reserve1 }
    },
    async buy (ethNum: number, price: number) {
      let ethAmount = tokenAmount(ethNum)

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
