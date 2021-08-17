import { SwapRouter } from "../typechain/uniswap_v3_periphery"
import { TokenAmount } from "../test/test.util"
import { BigNumberish, constants } from "ethers"

export type UniswapFee = "1.0%" | "0.3%" | "0.05%"
export const feeToInt = (fee: UniswapFee): number => {
  switch (fee) {
    case "1.0%":
      return 10000
    case "0.3%":
      return 3000
    case "0.05%":
      return 500
  }
}
export const intToFee = (fee: number): UniswapFee => {
  switch (fee) {
    case 10000:
      return "1.0%"
    case 3000:
      return "0.3%"
    case 500:
      return "0.05%"
    default:
      throw new Error(`Invalid fee ${fee}`)
  }
}
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const Uniswap = (swapRouter: SwapRouter) => ({
  swap (tokenIn: string, tokenOut: string, recipient: string) {
    return ({
      swapParams (amountIn: BigNumberish, fee: UniswapFee) {
        return {
          tokenIn,
          tokenOut,
          fee: feeToInt(fee),
          amountOutMinimum: 1,
          sqrtPriceLimitX96: 0,
          recipient,
          deadline: constants.MaxUint256,
          amountIn,
        }
      },
      async estimateAmountOut (amountIn: BigNumberish, fee: UniswapFee, overrides: { value?: BigNumberish } = {}) {
        try {
          return await swapRouter.callStatic.exactInputSingle(this.swapParams(amountIn, fee), overrides)
        } catch (e) {
          return undefined
        }
      },
      with (amountIn: TokenAmount, fee: UniswapFee, overrides: { value?: BigNumberish } = {}) {
        return swapRouter.exactInputSingle(this.swapParams(amountIn, fee), overrides)
      },
    })
  },
})
