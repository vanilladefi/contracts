/* eslint-disable camelcase */
import { computePoolAddress, safeListV1_02, WETH } from "../utils/safelists"
import Decimal from "decimal.js"
import { BigNumber } from "ethers"

import { HardhatRuntimeEnvironment } from "hardhat/types"
import { IERC20__factory } from "../typechain/openzeppelin"
import { IUniswapV3Pool__factory } from "../typechain/uniswap_v3_core"

export default async (_:never, { ethers }: HardhatRuntimeEnvironment): Promise<void> => {
  let pools = safeListV1_02.map((pool) => ({ ...pool, poolAddress: computePoolAddress(pool) }))

  const formatUniV3Price = (decimals: number, address: string) => {
    const wethDecimals = 18
    const x96 = new Decimal(2).pow(96)
    if (address < WETH.toLowerCase()) {
      return (sqrtPriceX96: BigNumber) => {
        let priceDecimal = new Decimal(sqrtPriceX96.toHexString()).dividedBy(x96).pow(2)
        return new Decimal(10 ** wethDecimals).div(priceDecimal).div(10 ** decimals).toDecimalPlaces(decimals)
      }
    } else {
      return (sqrtPriceX96: BigNumber) => {
        let priceDecimal = new Decimal(sqrtPriceX96.toHexString()).dividedBy(x96).pow(2)
        return priceDecimal.div(new Decimal(10 ** decimals).div(10 ** wethDecimals)).toDecimalPlaces(decimals)
      }
    }
  }

  let tokens = []
  let weth = IERC20__factory.connect(WETH, ethers.provider)
  for (const { poolAddress, symbol, address, decimals } of pools) {
    const price = formatUniV3Price(decimals, address)
    let pool = IUniswapV3Pool__factory.connect(poolAddress, ethers.provider)
    let { sqrtPriceX96, observationCardinality } = await pool.slot0()
    let wethBalance = await weth.balanceOf(poolAddress)
    tokens.push({
      symbol,
      address,
      decimals,
      ethPrice: price(sqrtPriceX96),
      oracleLength: observationCardinality,
      reserveETH: new Decimal(wethBalance.toHexString()).div(10 ** 18).toDecimalPlaces(18),
    })
  }
  console.table(tokens)
}
