import { HardhatRuntimeEnvironment } from "hardhat/types"
import UniswapPair from "@uniswap/v2-core/build/IUniswapV2Pair.json"

export default async (_:never, { ethers }: HardhatRuntimeEnvironment): Promise<void> => {
  // mainnet WBTC-WETH UNI-V2 pair https://etherscan.io/address/0xbb2b8038a1640196fbe3e38816f3e67cba72d940
  let wethBtc = "0xbb2b8038a1640196fbe3e38816f3e67cba72d940"
  let pair = new ethers.Contract(wethBtc, UniswapPair.abi, ethers.getDefaultProvider())
  let { reserve0, reserve1 } = await pair.getReserves()

  console.log("WBTC-WETH reserves:", BigInt(reserve0.toHexString()), BigInt(reserve1.toHexString()))
}
