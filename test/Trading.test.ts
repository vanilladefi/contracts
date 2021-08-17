/* eslint-disable camelcase */
import { BigNumber, BigNumberish, constants, utils, Wallet } from "ethers"
import {
  MockERC20__factory,
  MockVanillaV1MigrationTarget02__factory,
  UniswapV3TestHelper,
  UniswapV3TestHelper__factory,
  VanillaV1API01,
  VanillaV1Router02__factory,
  VanillaV1Token02__factory,
} from "../typechain/vanilla_v1.1"
import { use } from "chai"
import { waffleChai } from "@ethereum-waffle/chai"
import { ethers, waffle } from "hardhat"
import {
  IUniswapV3Pool,
  IUniswapV3Pool__factory,
  UniswapV3Factory,
  UniswapV3Factory__factory,
} from "../typechain/uniswap_v3_core"
import { IWETH9, Quoter__factory, SwapRouter__factory } from "../typechain/uniswap_v3_periphery"
import WETH9 from "./v1-artifacts/WETH9.json"
import VanillaV1Router from "./v1-artifacts/VanillaRouter.json"

import UniV2Router from "@uniswap/v2-periphery/build/UniswapV2Router02.json"
import UniV2Factory from "@uniswap/v2-core/build/UniswapV2Factory.json"
import { Decimal } from "decimal.js"
import {
  assert,
  asyncModelRun,
  asyncProperty,
  bigUintN,
  commands,
  constant,
  nat,
  oneof,
  shuffledSubarray,
  tuple,
} from "fast-check"
import {
  ApproveNextVersion,
  EmergencyWithdraw,
  IncreaseBlockTimeStamp,
  IncreaseObservationWindow,
  initializeTradingModel,
  MarketBuy,
  MarketSell,
  MigrateToNextVersion,
  VanillaBuy,
  VanillaSell,
  VanillaSellProfit,
} from "./trading.model"
import { IUniswapV2Factory, IUniswapV2Router02 } from "../typechain/uniswap_v2"
import { IERC20 } from "../typechain/openzeppelin"
import { connectUsing } from "../utils/DeploymentTools"

use(waffleChai)
const { provider, deployContract, createFixtureLoader } = waffle
const loadFixture = createFixtureLoader(provider.getWallets(), provider)

const NamedWallets = (wallets: Wallet[]) => {
  const [externalOwner, vanillaDAO, a, b, c, ...others] = wallets

  return { externalOwner, vanillaDAO, a, b, c, others }
}
const amountETH = (amount: number) => BigNumber.from(new Decimal(amount).mul(10 ** 18).floor().toHex())

const generateTokenSymbols = function * () {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVXYZ"
  let length = 3
  while (true) {
    for (const symbol of alphabet.split("").map(letter => letter.repeat(length))) {
      yield symbol
    }
    length++
  }
}

const ExternalDeployFixture = async (wallets: Wallet[]) => {
  let { externalOwner, vanillaDAO } = NamedWallets(wallets)
  const WETH = await deployContract(externalOwner, WETH9) as IWETH9
  await WETH.connect(externalOwner).deposit({ value: amountETH(1000) })

  const uniV3Factory = await new UniswapV3Factory__factory(externalOwner).deploy()
  const uniV3Router = await new SwapRouter__factory(externalOwner).deploy(uniV3Factory.address, WETH.address)
  const uniV3Quoter = await new Quoter__factory(externalOwner).deploy(uniV3Factory.address, WETH.address)

  const uniV2Factory = (await deployContract(externalOwner, UniV2Factory, [await externalOwner.getAddress()])) as IUniswapV2Factory
  const uniV2Router = (await deployContract(externalOwner, UniV2Router, [uniV2Factory.address, WETH.address])) as IUniswapV2Router02
  let tokenFactory = new MockERC20__factory(externalOwner)

  // deploy at least two tokens with addresses that are greater and less than WETH's (to make sure we can get all cases tested)
  let tokenA
  let tokenB
  let extraTokens = []
  for (const symbol of generateTokenSymbols()) {
    if (tokenA && tokenB) { break }

    let token = await tokenFactory.deploy(`Test ${symbol}`, symbol, 18, BigNumber.from(100000n * (10n ** 18n))) as IERC20
    if (!tokenA && token.address.toLowerCase() < WETH.address.toLowerCase()) {
      tokenA = token
    } else if (!tokenB && token.address.toLowerCase() > WETH.address.toLowerCase()) {
      tokenB = token
    } else {
      extraTokens.push(token)
    }
  }
  if (!tokenA || !tokenB) { throw new Error("Make this fixture deploy ERC-20s with address less and greater than WETH's!") }

  await uniV2Factory.createPair(WETH.address, tokenA.address)
  await uniV2Factory.createPair(WETH.address, tokenB.address)
  const vnlV1Router01 = await deployContract(externalOwner, VanillaV1Router, [uniV2Router.address, 1n * 10n ** 18n, [tokenA.address, tokenB.address]]) as VanillaV1API01

  const vnlV1Router02 = await new VanillaV1Router02__factory(vanillaDAO).deploy(uniV3Router.address, vnlV1Router01.address)
  const uniV3minter = await new UniswapV3TestHelper__factory(externalOwner).deploy()

  const pools = await InitializeLiquidity(uniV3Factory, uniV3minter, {
    mediumA: { fee: 3000, owner: externalOwner, token: tokenA, weth: WETH, amount: amountETH(100), initialPrice: UniV3Price("1.00") },
    mediumB: { fee: 3000, owner: externalOwner, token: tokenB, weth: WETH, amount: amountETH(100), initialPrice: UniV3Price("1.00") },
    lowA: { fee: 500, owner: externalOwner, token: tokenA, weth: WETH, amount: amountETH(100), initialPrice: UniV3Price("1.00") },
    lowB: { fee: 500, owner: externalOwner, token: tokenB, weth: WETH, amount: amountETH(100), initialPrice: UniV3Price("1.00") },
  })

  const vnlV1Token02 = VanillaV1Token02__factory.connect(await vnlV1Router02.vnlContract(), vanillaDAO)
  const nextVersion = await new MockVanillaV1MigrationTarget02__factory(externalOwner).deploy()

  let connect = connectUsing(ethers.provider)
  let safelist = await vnlV1Router02.safeList().then(connect.safelist)
  await safelist.connect(vanillaDAO).modify([tokenA.address, tokenB.address], [])
  return {
    wallets: NamedWallets(wallets),
    safelist,
    nextVersion,
    uniV3Factory,
    WETH,
    uniV3Router,
    tokenA,
    tokenB,
    extraTokens,
    vnlV1Router01,
    pools,
    uniV3minter,
    vnlV1Router02,
    vnlV1Token02,
    uniV3Quoter,
  }
}

type PoolParameters = { fee: 500 | 3000 | 10000, token: IERC20, weth: IWETH9, owner: Wallet, amount: BigNumberish, initialPrice: BigNumber }
async function InitializeLiquidity (uniV3Factory: UniswapV3Factory, uniV3Minter: UniswapV3TestHelper, pools: {[name: string]: PoolParameters}): Promise<{[name: string]: IUniswapV3Pool}> {
  let initializedPools: {[name: string]: IUniswapV3Pool} = {}
  for (const [name, { fee, token, weth, owner, amount, initialPrice }] of Object.entries(pools)) {
    await uniV3Factory.createPool(token.address, weth.address, fee)
    let pool = IUniswapV3Pool__factory.connect(await uniV3Factory.getPool(token.address, weth.address, fee), owner)
    let tickSpacing = await pool.tickSpacing()
    await token.connect(owner).approve(uniV3Minter.address, constants.MaxUint256)
    await weth.connect(owner).approve(uniV3Minter.address, constants.MaxUint256)
    await pool.initialize(initialPrice)

    let { high, low } = UniV3Position(owner, getMinTick(tickSpacing), getMaxTick(tickSpacing))
    await uniV3Minter.connect(owner).mint(pool.address,
      owner.address,
      low,
      high,
      amount)
    initializedPools[name] = pool
  }
  return initializedPools
}
const getMinTick = (tickSpacing: number) => Math.ceil(-887272 / tickSpacing) * tickSpacing
const getMaxTick = (tickSpacing: number) => Math.floor(887272 / tickSpacing) * tickSpacing

function UniV3Price (price: string): BigNumber {
  // uni v3 uses uint160's as prices internally, which represents sqrt(price) as 64x96 fixed point
  return BigNumber.from(
    new Decimal(price).sqrt().mul(new Decimal(2).pow(96)).floor().toHex(),
  )
}

function UniV3Position (owner: Wallet, low: number, high: number) {
  return {
    low,
    high,
    key: utils.keccak256(utils.solidityPack(["address", "int24", "int24"], [owner.address, low, high])),
  }
}
describe("Trading model", () => {
  it("invariants hold", async () => {
    try {
      const {
        wallets: { externalOwner, vanillaDAO, a }, nextVersion,
        tokenA, tokenB,
      } = await loadFixture(ExternalDeployFixture)
      let tokens = [tokenA, tokenB].map(constant)
      let modifiers = [vanillaDAO, a].map(constant)
      let randomAddress = bigUintN(160).map(n => ethers.utils.getAddress(ethers.utils.hexZeroPad("0x" + n.toString(16), 20))).noShrink()
      let transitions = [
        tuple(bigUintN(72).noShrink(), oneof(...tokens)).map(([amount, token]) => new MarketBuy(externalOwner, token, "0.05%", amount)),
        tuple(bigUintN(72).noShrink(), oneof(...tokens)).map(([amount, token]) => new MarketSell(externalOwner, token, "0.05%", amount)),
        tuple(bigUintN(64).noShrink(), oneof(...tokens)).map(([amount, token]) => new VanillaBuy(a, token, "0.05%", amount)),
        tuple(bigUintN(64), oneof(...tokens)).map(([amount, token]) => new VanillaSell(a, externalOwner, token, "0.05%", amount)),
        tuple(bigUintN(64).noShrink(), oneof(...tokens)).map(([amount, token]) => new VanillaSellProfit(a, externalOwner, token, "0.05%", amount)),
        shuffledSubarray([tokenA, tokenB]).map((tokens) => new EmergencyWithdraw(a, tokens)),
        shuffledSubarray([tokenA, tokenB]).map((tokens) => new MigrateToNextVersion(a, tokens)),
        nat(60).noShrink().map(seconds => new IncreaseBlockTimeStamp(ethers.provider, seconds + 1)),
        tuple(oneof(randomAddress, constant(nextVersion.address)), oneof(...modifiers)).map(([address, modifier]) => new ApproveNextVersion(address, vanillaDAO, modifier)),
        tuple(nat(127).noShrink(), oneof(...tokens)).map(([increase, token]) => new IncreaseObservationWindow(externalOwner, token, "0.05%", increase + 1)),
      ]

      let constraints = { replayPath: ":" }
      let runnerParams = {
        seed: new Date().getTime(),
        path: "0",
        endOnFailure: true,
      }
      // constraints = { replayPath: ":" }
      // runnerParams = { seed: 11, path: "10", endOnFailure: true }

      let shrinking = false
      let run = 1
      await assert(asyncProperty(commands(transitions, { maxCommands: 50, ...constraints }), async (cmds) => {
        const initialState = async () => {
          console.log(shrinking ? `\tTest failed, SHRINKING (seed ${runnerParams.seed})` : `\tStarting run #${run}`)
          const { wallets: { externalOwner, vanillaDAO, a }, uniV3Quoter, safelist, nextVersion, vnlV1Router02, tokenA, uniV3Router, vnlV1Token02, uniV3Factory, WETH, pools: { lowA, lowB } } = await loadFixture(ExternalDeployFixture)

          const real = {
            vnlV1Router02,
            uniV3Router,
            WETH,
            uniV3Factory,
            nextVersion,
            vnlV1Token02,
            vnlV1Safelist01: safelist,
            uniV3Quoter,
            timeFromLatest: async (seconds: number) => await ethers.provider.getBlock("latest").then(b => b.timestamp + seconds),
          }

          return {
            model: await initializeTradingModel(real, [lowA, lowB], [externalOwner, vanillaDAO, a], [WETH, tokenA, tokenB]),
            real,
          }
        }
        return asyncModelRun(initialState, cmds)
          .then(() => {
            run++
          })
          .catch(e => {
            shrinking = true
            throw e
          })
      }), {
        numRuns: 5,
        ...runnerParams,
      })
    } catch (e) {
      console.error("Failed to initialize", e)
      throw e
    }
  })
})
