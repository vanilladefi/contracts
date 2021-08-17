import { gql, request } from "graphql-request"
import { Provider } from "@ethersproject/providers"
import {
  VanillaV1MigrationState__factory,
  VanillaV1Router02__factory,
  VanillaV1Safelist01__factory,
  VanillaV1Token02__factory,
} from "../typechain/vanilla_v1.1"

type GraphQuery = {API: string, query: string}
export type Token = {address: string, symbol: string}
type BalancerPoolToken = Token & {balance: number, denormWeight: number}
type BalancerPool = {tokens: BalancerPoolToken[]}
type BalancerPools = {pools: BalancerPool[]}

const balancer: GraphQuery = {
  API: "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer",
  query: gql`
query balancer($blockNumber: Int, $weth: [String], $numHolders: Int) {
  pools(
    block: {number: $blockNumber},
    where: {tokensList_contains: $weth, publicSwap: true, holdersCount_gte: $numHolders},
    orderBy: liquidity, orderDirection: desc) {
    tokens {
      symbol,
      address,
      balance,
      denormWeight
    }
    swapsCount,
    holdersCount,
    liquidity
  }
}
  `,
}

type Pair = {token: Token, wethReserve: number, tokenReserve: number}
type UniswapLikePairs = {token0: Pair[], token1: Pair[]}

const uniswapV2: GraphQuery = {
  API: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2",
  query: gql`
    query uniPairs($blockNumber: Int, $weth: String, $reserveLimit: BigDecimal) {
      token0: pairs(
        block: {number: $blockNumber},
        where: {token0: $weth, reserve0_gte: $reserveLimit},
        orderBy: reserve0, orderDirection: desc) {
        token: token1 {
          symbol,
          address: id
        },
        wethReserve: reserve0
      },
      token1: pairs(
        block: {number: $blockNumber},
        where: {token1: $weth, reserve1_gte: $reserveLimit },
        orderBy: reserve1, orderDirection: desc) {
        token: token0 {
          symbol,
          address: id
        },
        wethReserve: reserve1
      }
    }
  `,
}
const sushi: GraphQuery = {
  API: "https://api.thegraph.com/subgraphs/name/sushiswap/exchange",
  query: uniswapV2.query,
}

export type ExchangeReserveEstimate = { token: Token, balReserve: number, sushiReserve: number, uniswapReserve: number };
type ExchangeReserveEstimates = Record<string, ExchangeReserveEstimate>
const getBalancerReserveEstimates = (poolTokens: BalancerPoolToken[]): ExchangeReserveEstimates => {
  let wethReserve = 0
  let tokenWeights = 0
  let nonWethTokens: BalancerPoolToken[] = []
  for (const poolToken of poolTokens) {
    if (poolToken.symbol === "WETH") {
      wethReserve = poolToken.balance
    } else {
      tokenWeights += Number(poolToken.denormWeight)
      nonWethTokens.push(poolToken)
    }
  }

  let reserveEstimates: ExchangeReserveEstimates = {}
  for (const nonWethToken of nonWethTokens) {
    // estimate the portion of the pool's WETH balance for each non-WETH token in the pool
    // example: if pool has token A and B with weights 40 and 60, we estimate token A have 40% of the pool's WETH reserve (40/(60+40)=0.4)
    // and token B have 60% - note that this is just an estimate because the balancing formula is more complex than this
    let estimate = nonWethToken.denormWeight * wethReserve / tokenWeights
    reserveEstimates[nonWethToken.address] = { token: nonWethToken, balReserve: estimate, sushiReserve: 0, uniswapReserve: 0 }
  }
  return reserveEstimates
}

export const queryCrossExchangeLiquidity = async (
  blockNumber: number,
  wethAddress: string,
  safeListCriteria: (t: ExchangeReserveEstimate) => boolean): Promise<ExchangeReserveEstimate[]> => {
  let balancerVariables = {
    blockNumber,
    weth: [wethAddress],
    numHolders: 10,
  }
  let uniSushiVariables = {
    blockNumber,
    weth: wethAddress,
    reserveLimit: 500,
  }
  let balancerPools = await request<BalancerPools>(balancer.API, balancer.query, balancerVariables)

  let totalReserves: ExchangeReserveEstimates = {}
  for (const { tokens } of balancerPools.pools) {
    let estimates = getBalancerReserveEstimates(tokens)
    for (const [address, reserveData] of Object.entries(estimates)) {
      let key = address.toLowerCase()
      if (totalReserves[key]) {
        totalReserves[key].balReserve += reserveData.balReserve
      } else {
        totalReserves[key] = reserveData
      }
    }
  }

  let sushiPairs = await request<UniswapLikePairs>(sushi.API, sushi.query, uniSushiVariables)
  for (const { token, wethReserve } of [...sushiPairs.token0, ...sushiPairs.token1]) {
    let key = token.address.toLowerCase()
    if (totalReserves[key]) {
      totalReserves[key].sushiReserve = Number(wethReserve)
    } else {
      totalReserves[key] = { token, sushiReserve: Number(wethReserve), balReserve: 0, uniswapReserve: 0 }
    }
  }

  let uniswapPairs = await request<UniswapLikePairs>(uniswapV2.API, uniswapV2.query, uniSushiVariables)
  for (const { token, wethReserve } of [...uniswapPairs.token0, ...uniswapPairs.token1]) {
    let key = token.address.toLowerCase()
    if (totalReserves[key]) {
      totalReserves[key].uniswapReserve = Number(wethReserve)
    } else {
      totalReserves[key] = { token, sushiReserve: 0, balReserve: 0, uniswapReserve: Number(wethReserve) }
    }
  }
  let estimates = Object.values(totalReserves)
  console.log("Safelist in block", blockNumber)
  console.table(estimates
    .filter(safeListCriteria)
    .map(x => ({
      token: x.token.symbol,
      total: x.uniswapReserve + x.sushiReserve + x.balReserve,
      u: x.uniswapReserve.toFixed(2),
      b: x.balReserve.toFixed(2),
      s: x.sushiReserve.toFixed(2),
    }))
    .sort((a, b) => b.total - a.total))
  return estimates.filter(safeListCriteria).sort((a, b) => a.token.symbol.localeCompare(b.token.symbol))
}
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const connectUsing = (provider: Provider) => ({
  router: (address: string) => VanillaV1Router02__factory.connect(address, provider),
  safelist: (address: string) => VanillaV1Safelist01__factory.connect(address, provider),
  vnlToken: (address: string) => VanillaV1Token02__factory.connect(address, provider),
  migrationState: (address: string) => VanillaV1MigrationState__factory.connect(address, provider),
})
