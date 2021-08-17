/* eslint-disable camelcase */
import { utils } from "ethers"

type FeeTier = "1.0%" | "0.3%" | "0.005%"

export const feeToUint = (fee: FeeTier): number => {
  switch (fee) {
    case "1.0%": return 10000
    case "0.3%": return 3000
    case "0.005%": return 500
  }
}

type UniV3Pool = {
  symbol: string,
  address: string,
  fee: FeeTier,
  decimals: number
}
export const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
const UNIV3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984"
const UNIV3_POOL_BYTECODE_HASH = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54"

// adapted from uniswap-v3-core/test/shared/utilities.ts
export const computePoolAddress = (
  { address, fee }: UniV3Pool,
): string => {
  const [token0, token1] = address.toLowerCase() < WETH.toLowerCase() ? [address, WETH] : [WETH, address]

  const create2Inputs = [
    "0xff",
    UNIV3_FACTORY_ADDRESS,
    utils.keccak256(utils.defaultAbiCoder.encode(
      ["address", "address", "uint24"],
      [token0, token1, feeToUint(fee)],
    )),
    UNIV3_POOL_BYTECODE_HASH,
  ]
  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join("")}`
  return utils.getAddress(`0x${utils.keccak256(sanitizedInputs).slice(-40)}`)
}

export const tokenAddress = (symbol: string): string => {
  let pool = safeListV1_02.find((pool: UniV3Pool) => pool.symbol === symbol)
  return pool ? pool.address : ""
}
export const safeListV1_02: UniV3Pool[] = [
  { symbol: "WBTC", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", fee: "0.3%", decimals: 8 },
  { symbol: "UNI", address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", fee: "0.3%", decimals: 18 },
  { symbol: "LINK", address: "0x514910771af9ca656af840dff83e8264ecf986ca", fee: "0.3%", decimals: 18 },
  { symbol: "CEL", address: "0xaaaebe6fe48e54f431b0c390cfaf0b017d09d42d", fee: "0.3%", decimals: 4 },
  { symbol: "PERP", address: "0xbc396689893d065f41bc2c6ecbee5e0085233447", fee: "0.3%", decimals: 18 },
  { symbol: "MKR", address: "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2", fee: "0.3%", decimals: 18 },
  { symbol: "SHIB", address: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", fee: "1.0%", decimals: 18 },
  { symbol: "TRIBE", address: "0xc7283b66eb1eb5fb86327f08e1b5816b0720212b", fee: "1.0%", decimals: 18 },
  { symbol: "MATIC", address: "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0", fee: "0.3%", decimals: 18 },
  { symbol: "WOOFY", address: "0xd0660cd418a64a1d44e9214ad8e459324d8157f1", fee: "1.0%", decimals: 12 },
  { symbol: "GTC", address: "0xde30da39c46104798bb5aa3fe8b9e0e1f348163f", fee: "1.0%", decimals: 18 },
  { symbol: "AUDIO", address: "0x18aaa7115705e8be94bffebde57af9bfc265b998", fee: "1.0%", decimals: 18 },
  { symbol: "YFI", address: "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e", fee: "0.3%", decimals: 18 },
  { symbol: "RPL", address: "0xb4efd85c19999d84251304bda99e90b92300bd93", fee: "0.3%", decimals: 18 },
  { symbol: "AAVE", address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", fee: "0.3%", decimals: 18 },
  { symbol: "DPI", address: "0x1494ca1f11d487c2bbe4543e90080aeba4ba3c2b", fee: "0.3%", decimals: 18 },
  { symbol: "QUICK", address: "0x6c28aef8977c9b773996d0e8376d2ee379446f2f", fee: "0.3%", decimals: 18 },
  { symbol: "SUSHI", address: "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2", fee: "0.3%", decimals: 18 },
  { symbol: "SNX", address: "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f", fee: "0.3%", decimals: 18 },
  { symbol: "HOT", address: "0x6c6ee5e31d828de241282b9606c8e98ea48526e2", fee: "1.0%", decimals: 18 },
  { symbol: "wNXM", address: "0x0d438f3b5175bebc262bf23753c1e53d03432bde", fee: "1.0%", decimals: 18 },
  { symbol: "GLM", address: "0x7dd9c5cba05e151c895fde1cf355c9a1d5da6429", fee: "0.3%", decimals: 18 },
  { symbol: "OCEAN", address: "0x967da4048cd07ab37855c090aaf366e4ce1b9f48", fee: "1.0%", decimals: 18 },
  { symbol: "BNT", address: "0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c", fee: "0.3%", decimals: 18 },
  { symbol: "COMP", address: "0xc00e94cb662c3520282e6f5717214004a7f26888", fee: "0.3%", decimals: 18 },
  { symbol: "1INCH", address: "0x111111111117dc0aa78b770fa6a738034120c302", fee: "0.3%", decimals: 18 },
]
