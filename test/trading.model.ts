/* eslint-disable camelcase,no-labels */
import { VanillaV1Router02, VanillaV1Safelist01, VanillaV1Token02 } from "../typechain/vanilla_v1.1"
import { ethers } from "hardhat"
import { AsyncCommand } from "fast-check/lib/types/fast-check-default"
import { BigNumberish, constants, Contract, ContractTransaction, Wallet } from "ethers"
import { IWETH9, Quoter, SwapRouter } from "../typechain/uniswap_v3_periphery"
import { expect } from "chai"
import { IUniswapV3Pool, IUniswapV3Pool__factory, UniswapV3Factory } from "../typechain/uniswap_v3_core"
import { IERC20, IERC20__factory } from "../typechain/openzeppelin"
import { JsonRpcProvider } from "@ethersproject/providers"
import { len6, pretty, receipt, toInt, TokenAmount } from "./test.util"
import { TransactionExecutionError } from "hardhat/internal/core/providers/errors"

type VanillaTestSystem = {
  vnlV1Router02: VanillaV1Router02,
  uniV3Router: SwapRouter,
  WETH: IWETH9,
  uniV3Factory: UniswapV3Factory,
  vnlV1Token02: VanillaV1Token02,
  vnlV1Safelist01: VanillaV1Safelist01,
  uniV3Quoter: Quoter,
  nextVersion: Contract, // this is a mock currently
  timeFromLatest: (seconds: number) => Promise<number>
}
type PositionData = {
  tokenSum: bigint,
  ethSum: bigint,
  weightedBlockSum: bigint,
  latestBlock: number,
}

export type UniswapFee = "1.0%" | "0.3%" | "0.05%"
const feeToInt = (fee: UniswapFee): number => {
  switch (fee) {
    case "1.0%": return 10000
    case "0.3%": return 3000
    case "0.05%": return 500
  }
}
const intToFee = (fee: number): UniswapFee => {
  switch (fee) {
    case 10000: return "1.0%"
    case 3000: return "0.3%"
    case 500: return "0.05%"
    default: throw new Error(`Invalid fee ${fee}`)
  }
}
export class TokenModel {
  private readonly balances: { [address: string]: bigint };

  constructor (readonly address: string) {
    this.balances = { }
  }

  setBalance (address: string, amount: TokenAmount): void {
    this.balances[address] = toInt(amount)
  }

  balanceOf (address: string): TokenAmount {
    return this.balances[address] || 0n
  }

  transferFrom (from: string, to: string, amount: TokenAmount): void {
    let num = toInt(amount)
    if (from === constants.AddressZero) {
      this.balances[to] += num
    } else {
      if (this.balanceOf(from) < num) { throw new Error(`${len6(this.address)}.transferFrom(${len6(from)}, ${len6(to)}, ${pretty(amount)}) (balance=${pretty(this.balanceOf(from))})`) }
      this.balances[from] -= num
      if (to !== constants.AddressZero) {
        this.balances[to] += num
      }
    }
  }

  mint (to: string, amount: TokenAmount): void {
    this.transferFrom(constants.AddressZero, to, amount)
  }

  burn (from: string, amount: TokenAmount): void {
    this.transferFrom(from, constants.AddressZero, amount)
  }
}

class UniswapPoolModel {
  public observationCardinalityNext: number
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly poolAddress: string, readonly token: TokenModel, readonly weth: TokenModel) {
    this.observationCardinalityNext = 1
  }

  buy (trader: string, amountWeth: TokenAmount, amountToken: TokenAmount) {
    this.weth.transferFrom(trader, this.poolAddress, amountWeth)
    this.token.transferFrom(this.poolAddress, trader, amountToken)
  }

  sell (trader: string, amountToken: TokenAmount, amountWeth: TokenAmount) {
    this.token.transferFrom(trader, this.poolAddress, amountToken)
    this.weth.transferFrom(this.poolAddress, trader, amountWeth)
  }

  increaseObservationCardinality (newValue: number) {
    this.observationCardinalityNext = Math.max(newValue, this.observationCardinalityNext)
  }
}

class WrappedEthModel {
  readonly ethBalances: { [address: string]: bigint };

  constructor (readonly weth: TokenModel) {
    this.ethBalances = { }
  }

  setBalance (address: string, amount: TokenAmount) {
    this.ethBalances[address] = toInt(amount)
  }

  deposit (trader: string, amount: TokenAmount) {
    let num = toInt(amount)
    if (!this.ethBalances[trader] || this.ethBalances[trader] < num) {
      throw new Error(`${len6(trader)}.balance = ${pretty(this.ethBalances[trader] || 0n)} < ${pretty(num)}`)
    }
    this.ethBalances[trader] -= num
    this.ethBalances[this.weth.address] += num
    this.weth.mint(trader, amount)
  }

  reduceTransactionCosts (trader: string, amount: TokenAmount) {
    this.ethBalances[trader] -= toInt(amount)
  }

  withdraw (trader: string, amount: TokenAmount) {
    let num = toInt(amount)
    this.weth.burn(trader, num)
    this.ethBalances[trader] += num
    this.ethBalances[this.weth.address] -= num
  }

  balanceOf (trader: string): TokenAmount {
    return this.ethBalances[trader] || 0n
  }
}

class VanillaModel {
  private readonly positions: {[owner: string]: {[token: string]: PositionData}} = {}
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly router: string, readonly epoch: number, readonly vnlToken: TokenModel, readonly ether: WrappedEthModel) {

  }

  findPosition (trader: string, token: string) {
    let tokens = this.positions[trader]
    if (!tokens) {
      tokens = {}
      this.positions[trader] = tokens
    }

    let position = tokens[token]
    if (!position) {
      position = { ethSum: 0n, tokenSum: 0n, latestBlock: 0, weightedBlockSum: 0n }
      tokens[token] = position
    }
    return position
  }

  clearPosition (trader: string, token: string) {
    let position = this.findPosition(trader, token)
    if (position.tokenSum > 0n) {
      this.positions[trader][token] = { ethSum: 0n, tokenSum: 0n, latestBlock: 0, weightedBlockSum: 0n }
    }
  }

  depositAndBuy (trader: string, amountWeth: TokenAmount, amountToken: TokenAmount, pool: UniswapPoolModel, bn: number) {
    this.ether.deposit(trader, amountWeth)
    this.buy(trader, amountWeth, amountToken, pool, bn)
  }

  buy (trader: string, amountWeth: TokenAmount, amountToken: TokenAmount, pool: UniswapPoolModel, bn: number) {
    pool.weth.transferFrom(trader, this.router, amountWeth)
    pool.buy(this.router, amountWeth, amountToken)

    let position = this.findPosition(trader, pool.token.address)
    position.ethSum += toInt(amountWeth)
    position.tokenSum += toInt(amountToken)
    position.latestBlock = bn
    position.weightedBlockSum += (toInt(amountToken) * BigInt(bn))
  }

  sell (trader: string, amountToken: TokenAmount, amountWeth: TokenAmount, pool: UniswapPoolModel, bn: number) {
    pool.sell(this.router, amountToken, amountWeth)
    pool.weth.transferFrom(this.router, trader, amountWeth)

    let position = this.findPosition(trader, pool.token.address)
    position.ethSum = position.ethSum * (position.tokenSum - toInt(amountToken)) / position.tokenSum
    position.weightedBlockSum = position.weightedBlockSum * (position.tokenSum - toInt(amountToken)) / position.tokenSum
    position.tokenSum -= toInt(amountToken)
    position.latestBlock = bn
  }

  sellAndWithdraw (trader: string, amountToken: TokenAmount, amountWeth: TokenAmount, pool: UniswapPoolModel, bn:number) {
    this.sell(trader, amountToken, amountWeth, pool, bn)
    this.ether.withdraw(trader, amountWeth)
  }
}

type VanillaTestModel = {
  blockTime: number
  etherModel: WrappedEthModel
  tokenModels: {[tokenAddress: string]: TokenModel}
  poolModels: {[tokenAddress: string]: Partial<Record<UniswapFee, UniswapPoolModel>>}
  vanillaModel: VanillaModel
  nextVersion?: string
}

export const initializeTradingModel = async (real: VanillaTestSystem, pools: IUniswapV3Pool[], users: Wallet[], tokens: (IERC20 | IWETH9)[]): Promise<VanillaTestModel> => {
  const { vnlV1Router02: vanillaRouter, WETH: weth, nextVersion, timeFromLatest } = real
  let tokenModels: {[token: string]: TokenModel} = { }
  const getTokenModel = async (address: string) => {
    let tokenModel = tokenModels[address]
    if (tokenModel) {
      return tokenModel
    }
    tokenModel = new TokenModel(address)

    let ercBalances = await Promise.all([...tokens, ...pools, ...users, vanillaRouter, nextVersion].map(
      tokenOwner => IERC20__factory.connect(address, ethers.provider).balanceOf(tokenOwner.address).then(balance => ({ balance, tokenOwner }))))

    for (const { balance, tokenOwner } of ercBalances) {
      tokenModel.setBalance(tokenOwner.address, balance)
    }
    tokenModels[address] = tokenModel
    return tokenModel
  }

  let wethModel = await getTokenModel(weth.address)
  let etherModel = new WrappedEthModel(wethModel)

  for (const { balance, tokenOwner } of await Promise.all([...tokens, ...pools, ...users, vanillaRouter, nextVersion].map(
    tokenOwner => ethers.provider.getBalance(tokenOwner.address).then(balance => ({ balance, tokenOwner }))))) {
    etherModel.setBalance(tokenOwner.address, balance)
  }
  let poolModels: {[token: string]: Partial<Record<UniswapFee, UniswapPoolModel>>} = { }
  for (const pool of pools) {
    let [token0, token1, fee] = await Promise.all([pool.token0(), pool.token1(), pool.fee().then(fee => intToFee(fee))])

    let token = token0 === weth.address ? token1 : token0

    let poolsByFee: Partial<Record<UniswapFee, UniswapPoolModel>> = { }
    poolsByFee[fee] = new UniswapPoolModel(pool.address, await getTokenModel(token), wethModel)

    poolModels[token] = poolsByFee
  }

  return {
    blockTime: await timeFromLatest(0),
    etherModel,
    tokenModels,
    poolModels,
    vanillaModel: new VanillaModel(vanillaRouter.address,
      await vanillaRouter.epoch().then(bn => bn.toNumber()),
      await getTokenModel(await vanillaRouter.vnlContract()),
      etherModel),
  }
}

const execute = async <T extends ContractTransaction> (operation: Promise<T>, logText?: string) => {
  let tx
  try {
    tx = await operation
  } catch (e) {
    if (e instanceof TransactionExecutionError && e.message) { console.error(`operation failed because '${e.message}':`, e) }
    throw e
  }

  if (logText) {
    let { blockNumber, gasUsed } = (await tx.wait())
    // console.log(`#${blockNumber}: ${logText} (gas ${gasUsed})`)
  }
  return operation
}

type SwapInput = {tokenIn: IERC20 | IWETH9, tokenOut: IERC20 | IWETH9, recipient: string, amountIn: TokenAmount, fee: UniswapFee}
const toUniswapParams = ({ tokenIn, tokenOut, recipient, amountIn, fee }: SwapInput) => ({
  tokenIn: tokenIn.address,
  tokenOut: tokenOut.address,
  fee: feeToInt(fee),
  amountOutMinimum: 1,
  sqrtPriceLimitX96: 0,
  recipient,
  deadline: constants.MaxUint256,
  amountIn,
})

type ApprovedContractTransaction = ContractTransaction & {approveTx?: ContractTransaction}
const UniswapSwap = (swapRouter: SwapRouter) => async (input: SwapInput, overrides: { value?: BigNumberish } = {}): Promise<ApprovedContractTransaction> => {
  if (overrides.value) {
    // no need to approve
    return swapRouter.exactInputSingle(toUniswapParams(input), overrides)
  }
  let tokenIn = input.tokenIn.connect(swapRouter.signer)
  let approveTx = await tokenIn.approve(swapRouter.address, input.amountIn)
  await approveTx.wait()
  let swapTx: ApprovedContractTransaction = await swapRouter.exactInputSingle(toUniswapParams(input), overrides)
  swapTx.approveTx = approveTx
  return swapTx
}
const UniswapQuote = (quoter: Quoter) => (input: SwapInput) => {
  let params = toUniswapParams(input)
  return quoter.callStatic.quoteExactInputSingle(params.tokenIn, params.tokenOut, params.fee, params.amountIn, params.sqrtPriceLimitX96)
}

abstract class TransactionCommand implements AsyncCommand<VanillaTestModel, VanillaTestSystem> {
  abstract check(m: Readonly<VanillaTestModel>): boolean

  async run (m: VanillaTestModel, r: VanillaTestSystem): Promise<void> {
    return this.execute(m, r).finally(async () => {
      m.blockTime = await r.timeFromLatest(0)
    })
  }

  abstract execute(m: VanillaTestModel, r: VanillaTestSystem): Promise<void>
}

export class MarketBuy extends TransactionCommand {
  constructor (readonly trader: Wallet, readonly token: IERC20, readonly fee: UniswapFee, readonly amount: bigint) {
    super()
  }

  check = (expected: VanillaTestModel): boolean => this.amount > 100 && this.amount < toInt(expected.etherModel.balanceOf(this.trader.address))

  execute = async (expected: VanillaTestModel, { uniV3Router, WETH, uniV3Quoter }: VanillaTestSystem): Promise<void> => {
    let swapInput = { amountIn: this.amount, fee: this.fee, tokenOut: this.token, tokenIn: WETH, recipient: this.trader.address }
    let quote = UniswapQuote(uniV3Quoter)
    let swap = UniswapSwap(uniV3Router.connect(this.trader))
    let amountOut = await quote(swapInput)
    let operation = execute(swap(swapInput, { value: this.amount }),
      `Trader ${len6(this.trader)} buys ${pretty(this.amount)} ${len6(this.token)} from Uniswap (${this.fee}), out: ${pretty(amountOut)}`)

    await expect(operation).to.not.be.reverted

    let poolModel = expected.poolModels[this.token.address][this.fee]
    if (!poolModel) {
      throw new Error("Pool model should be initialized already")
    }

    let { txCost } = await receipt(operation)
    expected.etherModel.deposit(this.trader.address, this.amount)
    poolModel.buy(this.trader.address, this.amount, amountOut)
    expected.etherModel.reduceTransactionCosts(this.trader.address, txCost)
    expect(await this.trader.getBalance()).to.equal(expected.etherModel.balanceOf(this.trader.address))
  }

  toString (): string {
    return `uniswap buy ${pretty(this.amount)} ${len6(this.token)}`
  }
}

export class MarketSell extends TransactionCommand {
  constructor (readonly trader: Wallet, readonly token: IERC20, readonly fee: UniswapFee, readonly amount: bigint) {
    super()
  }

  check = (expected: VanillaTestModel): boolean => this.amount > 100 && expected.tokenModels[this.token.address].balanceOf(this.trader.address) >= this.amount

  execute = async (expected: VanillaTestModel, { uniV3Router, WETH, uniV3Quoter }: VanillaTestSystem): Promise<void> => {
    let swapInput = { amountIn: this.amount, fee: this.fee, tokenIn: this.token, tokenOut: WETH, recipient: this.trader.address }
    let quote = UniswapQuote(uniV3Quoter)
    let swap = UniswapSwap(uniV3Router.connect(this.trader))
    let amountOut = await quote(swapInput)
    let swapOperation = execute(swap(swapInput),
      `Trader ${len6(this.trader)} sells ${pretty(this.amount)} ${len6(this.token)} from Uniswap (${this.fee}), out: ${pretty(amountOut)}`)

    await expect(swapOperation).not.to.be.reverted
    let poolModel = expected.poolModels[this.token.address][this.fee]
    if (!poolModel) {
      throw new Error("Pool model should be initialized already")
    }

    let { txCost: approveCost } = await receipt(swapOperation.then(op => op.approveTx))
    let [{ txCost: swapCost }, balanceAfterSwap] = await Promise.all([receipt(swapOperation), this.trader.getBalance()])
    poolModel.sell(this.trader.address, this.amount, amountOut)
    expected.etherModel.reduceTransactionCosts(this.trader.address, approveCost)
    expected.etherModel.reduceTransactionCosts(this.trader.address, swapCost)
    expect(balanceAfterSwap).to.equal(expected.etherModel.balanceOf(this.trader.address))
  }

  toString (): string {
    return `uniswap sell ${pretty(this.amount)} ${len6(this.token)}`
  }
}

export class VanillaBuy extends TransactionCommand {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly trader: Wallet, readonly token: IERC20, readonly fee: UniswapFee, readonly amount: bigint) {
    super()
  }

  check = (): boolean => true

  execute = async (expected: VanillaTestModel, { WETH, vnlV1Router02, timeFromLatest, uniV3Quoter }: VanillaTestSystem): Promise<void> => {
    let deadline = await timeFromLatest(10)
    if (expected.blockTime > deadline) {
      let trade = execute(vnlV1Router02.connect(this.trader).executePayable([
        vnlV1Router02.interface.encodeFunctionData("buy",
          [{
            token: this.token.address,
            fee: feeToInt(this.fee),
            numToken: 1,
            numEth: this.amount,
            blockTimeDeadline: deadline,
            useWETH: false,
          }]),
      ], { value: this.amount }), `Trader ${len6(this.trader)} buys ${pretty(this.amount)} ${len6(this.token)} via Vanilla (${this.fee})`)
      await expect(trade).to.be.revertedWith(Errors.TradeExpired())
      return
    }
    if (this.amount === 0n) {
      let trade = execute(vnlV1Router02.connect(this.trader).executePayable([
        vnlV1Router02.interface.encodeFunctionData("buy",
          [{
            token: this.token.address,
            fee: feeToInt(this.fee),
            numToken: 1,
            numEth: this.amount,
            blockTimeDeadline: constants.MaxUint256,
            useWETH: false,
          }]),
      ], { value: this.amount }), `Trader ${len6(this.trader)} buys ${pretty(this.amount)} ${len6(this.token)} via Vanilla (${this.fee})`)
      await expect(trade).to.be.revertedWith("AS") // "Amount Specified" from Uniswap pool
      return
    }
    let amountOut = await UniswapQuote(uniV3Quoter)({
      tokenIn: WETH,
      tokenOut: this.token,
      fee: this.fee,
      amountIn: this.amount,
      recipient: this.trader.address,
    })
    let trade = execute(vnlV1Router02.connect(this.trader).executePayable([
      vnlV1Router02.interface.encodeFunctionData("buy",
        [{
          token: this.token.address,
          fee: feeToInt(this.fee),
          numToken: 1,
          numEth: this.amount,
          blockTimeDeadline: constants.MaxUint256,
          useWETH: false,
        }]),
    ], { value: this.amount }), `Trader ${len6(this.trader)} buys ${pretty(this.amount)} ${len6(this.token)} via Vanilla (${this.fee})`)

    await expect(trade).to.not.be.reverted

    await expect(trade).to.emit(vnlV1Router02, "TokensPurchased").withArgs(this.trader.address, this.token.address, this.amount, amountOut)

    let poolModel = expected.poolModels[this.token.address][this.fee]
    if (!poolModel) {
      throw new Error("Pool model should be initialized already")
    }
    let tokenModel = expected.tokenModels[this.token.address]
    let { blockNumber, txCost } = await receipt(trade)
    expected.vanillaModel.depositAndBuy(this.trader.address, this.amount, amountOut, poolModel,
      blockNumber)
    expected.etherModel.reduceTransactionCosts(this.trader.address, txCost)

    let [traderPosition, custodyBalance, poolBalance, traderBalance] = await Promise.all([
      vnlV1Router02.tokenPriceData(this.trader.address, this.token.address),
      this.token.balanceOf(vnlV1Router02.address),
      WETH.balanceOf(poolModel.poolAddress),
      this.trader.getBalance()])

    let expectedPosition = expected.vanillaModel.findPosition(this.trader.address, this.token.address)
    expect(traderPosition.ethSum).to.equal(expectedPosition.ethSum)
    expect(traderPosition.tokenSum).to.equal(expectedPosition.tokenSum)
    expect(traderPosition.weightedBlockSum).to.equal(expectedPosition.weightedBlockSum)
    expect(traderPosition.latestBlock).to.equal(expectedPosition.latestBlock)

    expect(custodyBalance).to.equal(tokenModel.balanceOf(vnlV1Router02.address))
    expect(poolBalance).to.equal(expected.etherModel.weth.balanceOf(poolModel.poolAddress))
    expect(traderBalance).to.equal(expected.etherModel.balanceOf(this.trader.address))
  }

  toString (): string {
    return `vanilla buy ${pretty(this.amount)} ${len6(this.token)}`
  }
}

const Errors = {
  NoTokenPositionFound: (owner: Wallet, token: IERC20) => `NoTokenPositionFound("${owner.address}", "${token.address}")`,
  TokenBalanceExceeded: (tokens: TokenAmount, balance: TokenAmount) => `TokenBalanceExceeded(${tokens.toString()}, ${balance.toString()})`,
  SlippageExceeded: (expected: TokenAmount, actual: TokenAmount) => `SlippageExceeded(${expected.toString()}, ${actual.toString()})`,
  TradeExpired: () => "TradeExpired()",
  UnapprovedMigrationTarget: (unexpected: Contract) => `UnapprovedMigrationTarget("${unexpected.address}")`,
}

export class VanillaSell extends TransactionCommand {
  constructor (readonly trader: Wallet, readonly tokenOwner: Wallet, readonly token: IERC20, readonly fee: UniswapFee, readonly amount: bigint) {
    super()
  }

  check = (): boolean => true

  execute = async (expected: VanillaTestModel, { WETH, vnlV1Router02, timeFromLatest, vnlV1Token02, uniV3Quoter }: VanillaTestSystem): Promise<void> => {
    let deadline = await timeFromLatest(10)
    if (deadline < expected.blockTime) {
      let trade = execute(vnlV1Router02.connect(this.trader).executePayable([
        vnlV1Router02.interface.encodeFunctionData("sell",
          [{
            token: this.token.address,
            fee: feeToInt(this.fee),
            numToken: this.amount,
            numEth: 1,
            blockTimeDeadline: deadline,
            useWETH: false,
          }]),
      ]))
      await expect(trade).to.be.revertedWith(Errors.TradeExpired())
      return
    }

    expect(await this.trader.getBalance()).to.equal(expected.etherModel.balanceOf(this.trader.address))
    let tokenBalance = expected.vanillaModel.findPosition(this.trader.address, this.token.address).tokenSum
    if (tokenBalance === 0n) {
      let trade = execute(vnlV1Router02.connect(this.trader).executePayable([
        vnlV1Router02.interface.encodeFunctionData("sell",
          [{
            token: this.token.address,
            fee: feeToInt(this.fee),
            numToken: this.amount,
            numEth: 1,
            blockTimeDeadline: constants.MaxUint256,
            useWETH: false,
          }]),
      ]), `Trader ${len6(this.trader)} sells ${pretty(this.amount)} ${len6(this.token)} via Vanilla (${this.fee})`)
      await expect(trade).to.be.revertedWith(Errors.NoTokenPositionFound(this.trader, this.token))
      return
    }

    if (tokenBalance < this.amount) {
      let trade = execute(vnlV1Router02.connect(this.trader).executePayable([
        vnlV1Router02.interface.encodeFunctionData("sell",
          [{
            token: this.token.address,
            fee: feeToInt(this.fee),
            numToken: this.amount,
            numEth: 1,
            blockTimeDeadline: constants.MaxUint256,
            useWETH: false,
          }]),
      ]), `Trader ${len6(this.trader)} sells ${pretty(this.amount)} ${len6(this.token)} via Vanilla (${this.fee})`)
      await expect(trade).to.be.revertedWith(Errors.TokenBalanceExceeded(this.amount, tokenBalance))
      return
    }
    let amountOut = await UniswapQuote(uniV3Quoter)({
      tokenIn: this.token,
      tokenOut: WETH,
      fee: this.fee,
      amountIn: this.amount,
      recipient: this.trader.address,
    })
    await vnlV1Router02.tokenPriceData(this.trader.address, this.token.address)
    let trade = execute(vnlV1Router02.connect(this.trader).executePayable([
      vnlV1Router02.interface.encodeFunctionData("sell",
        [{
          token: this.token.address,
          fee: feeToInt(this.fee),
          numToken: this.amount,
          numEth: 1,
          blockTimeDeadline: constants.MaxUint256,
          useWETH: false,
        }]),
    ], { gasLimit: 2000000 }), `Trader ${len6(this.trader)} sells ${pretty(this.amount)} ${len6(this.token)} via Vanilla (${this.fee})`)
    await expect(trade).to.not.be.reverted

    let poolModel = expected.poolModels[this.token.address][this.fee]
    if (!poolModel) {
      throw new Error("Pool model should be initialized already")
    }
    let tokenModel = expected.tokenModels[this.token.address]
    let { events, txCost, blockNumber } = await receipt(trade, [vnlV1Router02.filters.TokensSold])
    expect(events.length).to.equal(1)
    let [{ args }] = events

    if (!args) throw new Error("No arguments in TokensSold event, tooling bug")
    let positionBeforeTrade = expected.vanillaModel.findPosition(this.trader.address, this.token.address)
    let profitablePrice = this.amount * positionBeforeTrade.ethSum / positionBeforeTrade.tokenSum
    expect(args.seller).to.equal(this.trader.address)
    expect(args.token).to.equal(this.token.address)
    expect(args.amount).to.equal(this.amount)
    expect(args.eth).to.equal(amountOut)
    let expectedProfit = amountOut.sub(profitablePrice)
    expect(args.profit).to.equal(expectedProfit.lte(0) ? 0 : expectedProfit)
    if (args.reward.gt(0)) {
      expected.vanillaModel.vnlToken.mint(this.trader.address, args.reward)
    }

    expected.vanillaModel.sellAndWithdraw(this.trader.address, this.amount, amountOut, poolModel,
      blockNumber)
    expected.etherModel.reduceTransactionCosts(this.trader.address, txCost)

    let [traderPosition, custodyBalance, traderBalance, traderVNL] = await Promise.all([
      vnlV1Router02.tokenPriceData(this.trader.address, this.token.address),
      this.token.balanceOf(vnlV1Router02.address),
      this.trader.getBalance(),
      vnlV1Token02.balanceOf(this.trader.address),
    ])

    let expectedPosition = expected.vanillaModel.findPosition(this.trader.address, this.token.address)
    expect(traderPosition.ethSum).to.equal(expectedPosition.ethSum)
    expect(traderPosition.tokenSum).to.equal(expectedPosition.tokenSum)
    expect(traderPosition.weightedBlockSum).to.equal(expectedPosition.weightedBlockSum)
    expect(traderPosition.latestBlock).to.equal(expectedPosition.latestBlock)

    expect(custodyBalance).to.equal(tokenModel.balanceOf(vnlV1Router02.address))
    expect(traderBalance).to.equal(expected.etherModel.balanceOf(this.trader.address))
    expect(traderVNL).to.equal(expected.vanillaModel.vnlToken.balanceOf(this.trader.address))
  }

  toString (): string {
    return `vanilla sell ${pretty(this.amount)} ${len6(this.token)}`
  }
}

export class VanillaSellProfit extends TransactionCommand {
  constructor (readonly trader: Wallet, readonly tokenOwner: Wallet, readonly token: IERC20, readonly fee: UniswapFee, readonly amount: bigint) {
    super()
  }

  check = (): boolean => true

  execute = async (expected: VanillaTestModel, { WETH, vnlV1Router02, vnlV1Token02, timeFromLatest, uniV3Quoter }: VanillaTestSystem): Promise<void> => {
    let deadline = await timeFromLatest(10)
    if (deadline < expected.blockTime) {
      let trade = execute(vnlV1Router02.connect(this.trader).executePayable([
        vnlV1Router02.interface.encodeFunctionData("sell",
          [{
            token: this.token.address,
            fee: feeToInt(this.fee),
            numToken: this.amount,
            numEth: 1,
            blockTimeDeadline: deadline,
            useWETH: false,
          }]),
      ]))
      await expect(trade).to.be.revertedWith(Errors.TradeExpired())
      return
    }
    expect(await this.trader.getBalance()).to.equal(expected.etherModel.balanceOf(this.trader.address))
    let { tokenSum, ethSum } = expected.vanillaModel.findPosition(this.trader.address, this.token.address)
    if (tokenSum === 0n) {
      let trade = execute(vnlV1Router02.connect(this.trader).executePayable([
        vnlV1Router02.interface.encodeFunctionData("sell",
          [{
            token: this.token.address,
            fee: feeToInt(this.fee),
            numToken: this.amount,
            numEth: 1,
            blockTimeDeadline: constants.MaxUint256,
            useWETH: false,
          }]),
      ]), `Trader ${len6(this.trader)} sells ${pretty(this.amount)} ${len6(this.token)} via Vanilla (${this.fee})`)
      await expect(trade).to.be.revertedWith(Errors.NoTokenPositionFound(this.trader, this.token))
      return
    }

    if (tokenSum < this.amount) {
      let trade = execute(vnlV1Router02.connect(this.trader).executePayable([
        vnlV1Router02.interface.encodeFunctionData("sell",
          [{
            token: this.token.address,
            fee: feeToInt(this.fee),
            numToken: this.amount,
            numEth: 1,
            blockTimeDeadline: constants.MaxUint256,
            useWETH: false,
          }]),
      ]), `Trader ${len6(this.trader)} sells ${pretty(this.amount)} ${len6(this.token)} via Vanilla (${this.fee})`)
      await expect(trade).to.be.revertedWith(Errors.TokenBalanceExceeded(this.amount, tokenSum))
      return
    }

    let amountOut = await UniswapQuote(uniV3Quoter)({
      tokenIn: this.token,
      tokenOut: WETH,
      fee: this.fee,
      amountIn: this.amount,
      recipient: this.trader.address,
    })

    let profitablePrice = this.amount * ethSum / tokenSum

    if (toInt(amountOut) < profitablePrice) {
      expect(await this.trader.getBalance()).to.equal(expected.etherModel.balanceOf(this.trader.address))
      let trade = execute(vnlV1Router02.connect(this.trader).executePayable([
        vnlV1Router02.interface.encodeFunctionData("sell",
          [{
            token: this.token.address,
            fee: feeToInt(this.fee),
            numToken: this.amount,
            numEth: profitablePrice,
            blockTimeDeadline: constants.MaxUint256,
            useWETH: false,
          }]),
      ], { gasLimit: 2000000 }), `Trader ${len6(this.trader)} sells ${pretty(this.amount)} ${len6(this.token)} min ${pretty(profitablePrice)} via Vanilla (${this.fee})`)
      await expect(trade).to.be.revertedWith(Errors.SlippageExceeded(profitablePrice, amountOut))

      let { txCost } = await receipt(trade)
      expected.etherModel.reduceTransactionCosts(this.trader.address, txCost)
      expect(await this.trader.getBalance()).to.equal(expected.etherModel.balanceOf(this.trader.address))
      return
    }
    let { avgBlock, estimate: estimates } = await vnlV1Router02.estimateReward(this.trader.address, this.token.address, amountOut, this.amount)

    let estimate
    if (this.fee === "0.05%") {
      estimate = estimates.low
    } else if (this.fee === "0.3%") {
      estimate = estimates.medium
    } else {
      estimate = estimates.high
    }

    let trade = execute(vnlV1Router02.connect(this.trader).executePayable([
      vnlV1Router02.interface.encodeFunctionData("sell",
        [{
          token: this.token.address,
          fee: feeToInt(this.fee),
          numToken: this.amount,
          numEth: profitablePrice,
          blockTimeDeadline: constants.MaxUint256,
          useWETH: false,
        }]),
    ], { gasLimit: 2000000 }), `Trader ${len6(this.trader)} sells ${pretty(this.amount)} ${len6(this.token)} min ${pretty(profitablePrice)} via Vanilla (${this.fee})`)
    await expect(trade).to.not.be.reverted

    let { events, txCost, blockNumber } = await receipt(trade, [vnlV1Router02.filters.TokensSold])
    expect(events.length).to.equal(1)
    let [{ args }] = events

    if (!args) throw new Error("No arguments in TokensSold event, tooling bug")

    expect(args.seller).to.equal(this.trader.address)
    expect(args.token).to.equal(this.token.address)
    expect(args.amount).to.equal(this.amount)
    expect(args.eth).to.equal(amountOut)
    let expectedProfit = amountOut.sub(profitablePrice)
    expect(args.profit).to.equal(expectedProfit)

    // getting the exact reward amount is actually hard because the Uniswap pool
    // oracle state calculations are pretty complex and rely both on block.timestamp and block.number
    // and we don't really want to replicate that here :(
    // we can however test easily that actual reward is within some boundaries when there's no swaps between the estimate
    // and the sell-order:
    // - the actual reward will be always greater or equal than the estimate, because actual reward has longer twap period
    //   which increases the TWAPs weight in profitable price calculations
    // - the actual reward will be always less or equal than the `eth_profit * HTRS` (again, we cannot rely on the estimate because
    //   the block.numbers will differ)
    expect(args.reward).to.be.gte(estimate.reward)
    let trading = BigInt(blockNumber - expected.vanillaModel.epoch) ** 2n
    let holding = BigInt(blockNumber - avgBlock.toNumber()) ** 2n
    let htrsTimesProfit = holding * toInt(expectedProfit) / trading
    expect(args.reward).to.be.lte(htrsTimesProfit)
    expected.vanillaModel.vnlToken.mint(this.trader.address, args.reward)

    let poolModel = expected.poolModels[this.token.address][this.fee]
    if (!poolModel) {
      throw new Error("Pool model should be initialized already")
    }
    if (poolModel.observationCardinalityNext === 1) {
      expect(args.reward).to.equal(0)
    }
    let tokenModel = expected.tokenModels[this.token.address]
    expected.vanillaModel.sellAndWithdraw(this.trader.address, this.amount, amountOut, poolModel,
      blockNumber)
    expected.etherModel.reduceTransactionCosts(this.trader.address, txCost)

    let [traderPosition, custodyBalance, traderBalance, traderVNL] = await Promise.all([
      vnlV1Router02.tokenPriceData(this.trader.address, this.token.address),
      this.token.balanceOf(vnlV1Router02.address),
      this.trader.getBalance(),
      vnlV1Token02.balanceOf(this.trader.address),
    ])

    let expectedPosition = expected.vanillaModel.findPosition(this.trader.address, this.token.address)
    expect(traderPosition.ethSum).to.equal(expectedPosition.ethSum)
    expect(traderPosition.tokenSum).to.equal(expectedPosition.tokenSum)
    expect(traderPosition.weightedBlockSum).to.equal(expectedPosition.weightedBlockSum)
    expect(traderPosition.latestBlock).to.equal(expectedPosition.latestBlock)

    expect(custodyBalance).to.equal(tokenModel.balanceOf(vnlV1Router02.address))
    expect(traderBalance).to.equal(expected.etherModel.balanceOf(this.trader.address))
    expect(traderVNL).to.equal(expected.vanillaModel.vnlToken.balanceOf(this.trader.address))
  }

  toString (): string {
    return `vanilla sell profitably ${pretty(this.amount)} ${len6(this.token)}`
  }
}

export class IncreaseObservationWindow extends TransactionCommand {
  constructor (readonly tokenOwner: Wallet, readonly token: IERC20, readonly fee: UniswapFee, readonly increase: number) {
    super()
  }

  check = (): boolean => true

  execute = async (expected: VanillaTestModel, { uniV3Factory, WETH }: VanillaTestSystem): Promise<void> => {
    let pool = await uniV3Factory.getPool(this.token.address, WETH.address, feeToInt(this.fee))
      .then(address => IUniswapV3Pool__factory.connect(address, this.tokenOwner))

    let poolModel = expected.poolModels[this.token.address][this.fee]
    if (!poolModel) {
      throw new Error("Pool model should be initialized already")
    }
    let { observationCardinalityNext } = await pool.slot0()
    let operation = execute(pool.increaseObservationCardinalityNext(observationCardinalityNext + this.increase),
      `Trader ${len6(this.tokenOwner)} grows pool ${len6(this.token)}:${this.fee} observation window by ${this.increase}`)

    await expect(operation).to.not.be.reverted

    let [{ txCost }, balance, newCardinality] = await Promise.all([
      receipt(operation),
      this.tokenOwner.getBalance(),
      pool.slot0().then(slot => slot.observationCardinalityNext),
    ])

    poolModel.increaseObservationCardinality(observationCardinalityNext + this.increase)
    expected.etherModel.reduceTransactionCosts(this.tokenOwner.address, txCost)
    expect(balance).to.equal(expected.etherModel.balanceOf(this.tokenOwner.address))
    expect(newCardinality).to.equal(poolModel.observationCardinalityNext)
  }

  toString (): string {
    return `uniswap grow window by ${this.increase} (pool ${len6(this.token)} ${this.fee})`
  }
}

export class EmergencyWithdraw extends TransactionCommand {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly tokenOwner: Wallet, readonly tokens: IERC20[]) {
    super()
  }

  check = (): boolean => true

  execute = async (expected: VanillaTestModel, { vnlV1Router02 }: VanillaTestSystem): Promise<void> => {
    type Position = PositionData & {token: IERC20}
    let currentPositions: Position[] = this.tokens.map(token => ({ token, ...expected.vanillaModel.findPosition(this.tokenOwner.address, token.address) }))
    let tokensOwned: Position[] = currentPositions.filter(p => p.tokenSum > 0n)
    let tokensNotOwned: Position[] = currentPositions.filter(p => p.tokenSum === 0n)
    let operation = execute(vnlV1Router02.connect(this.tokenOwner).execute(
      this.tokens.map(token => vnlV1Router02.interface.encodeFunctionData("withdrawTokens", [token.address])), {}),
      `Trader ${len6(this.tokenOwner)} withdraws [${this.tokens.map(len6)}]`)
    if (tokensNotOwned.length) {
      await expect(operation).to.be.revertedWith(Errors.NoTokenPositionFound(this.tokenOwner, tokensNotOwned[0].token))
      return
    }
    await expect(operation).to.not.be.reverted

    let [{ txCost }, balance] = await Promise.all([receipt(operation), this.tokenOwner.getBalance()])
    expected.etherModel.reduceTransactionCosts(this.tokenOwner.address, txCost)
    expect(balance).to.equal(expected.etherModel.balanceOf(this.tokenOwner.address))

    for (const position of tokensOwned) {
      expected.tokenModels[position.token.address].transferFrom(vnlV1Router02.address, this.tokenOwner.address, position.tokenSum)
      expected.vanillaModel.clearPosition(this.tokenOwner.address, position.token.address)

      let tokenModel = expected.tokenModels[position.token.address]
      let [personalBalance, custodyBalance, { tokenSum, ethSum, weightedBlockSum, latestBlock }] = await Promise.all([
        position.token.balanceOf(this.tokenOwner.address),
        position.token.balanceOf(vnlV1Router02.address),
        vnlV1Router02.tokenPriceData(this.tokenOwner.address, position.token.address),
      ])
      expect(personalBalance).to.equal(tokenModel.balanceOf(this.tokenOwner.address))
      expect(custodyBalance).to.equal(tokenModel.balanceOf(vnlV1Router02.address))
      expect(tokenSum).to.equal(0)
      expect(ethSum).to.equal(0)
      expect(weightedBlockSum).to.equal(0)
      expect(latestBlock).to.equal(0)
    }
  }

  toString (): string {
    return `trader ${len6(this.tokenOwner)} withdraws tokens ${this.tokens.map(len6)}`
  }
}

export class ApproveNextVersion extends TransactionCommand {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly nextVersion: string, readonly realOwner: Wallet, readonly modifier: Wallet) {
    super()
  }

  check = (): boolean => true;

  execute = async (expected: VanillaTestModel, { vnlV1Safelist01: real }: VanillaTestSystem): Promise<void> => {
    let operation = execute(real.connect(this.modifier).approveNextVersion(this.nextVersion), `safelist.approveNextVersion(${len6(this.nextVersion)}) by ${len6(this.modifier.address)}`)
    if (this.realOwner.address !== this.modifier.address) {
      await expect(operation).to.be.revertedWith("UnauthorizedAccess()")
      return
    }
    await expect(operation).to.not.be.reverted
    expected.nextVersion = this.nextVersion

    expect(await real.nextVersion()).to.equal(expected.nextVersion)
  };

  toString (): string {
    return `safelist.approveNextVersion(${this.nextVersion}) by ${this.modifier.address}`
  }
}

export class MigrateToNextVersion extends TransactionCommand {
  constructor (readonly tokenOwner: Wallet, readonly tokens: IERC20[]) {
    super()
  }

  check = (): boolean => true

  execute = async (expected: VanillaTestModel, { vnlV1Router02, nextVersion }: VanillaTestSystem): Promise<void> => {
    type Position = PositionData & {token: IERC20}
    let currentPositions: Position[] = this.tokens.map(token => ({ token, ...expected.vanillaModel.findPosition(this.tokenOwner.address, token.address) }))
    let tokensOwned: Position[] = currentPositions.filter(p => p.tokenSum > 0n)
    let tokensNotOwned: Position[] = currentPositions.filter(p => p.tokenSum === 0n)

    let operation = execute(vnlV1Router02.connect(this.tokenOwner).execute(
      this.tokens.map(token => vnlV1Router02.interface.encodeFunctionData("migratePosition", [token.address, nextVersion.address])), {}),
      `Trader ${len6(this.tokenOwner)} migrates [${this.tokens.map(len6)}]`)
    if (this.tokens.length && expected.nextVersion !== nextVersion.address) {
      await expect(operation).to.be.revertedWith(Errors.UnapprovedMigrationTarget(nextVersion))
      return
    }
    if (tokensNotOwned.length) {
      await expect(operation).to.be.revertedWith(Errors.NoTokenPositionFound(this.tokenOwner, tokensNotOwned[0].token))
      return
    }
    await expect(operation).to.not.be.reverted

    let [{ txCost }, balance] = await Promise.all([receipt(operation), this.tokenOwner.getBalance()])
    expected.etherModel.reduceTransactionCosts(this.tokenOwner.address, txCost)
    expect(balance).to.equal(expected.etherModel.balanceOf(this.tokenOwner.address))

    for (const position of tokensOwned) {
      expected.tokenModels[position.token.address].transferFrom(vnlV1Router02.address, nextVersion.address, position.tokenSum)
      expected.vanillaModel.clearPosition(this.tokenOwner.address, position.token.address)

      let tokenModel = expected.tokenModels[position.token.address]
      let [nextVersionBalance, custodyBalance, oldPosition] = await Promise.all([
        position.token.balanceOf(nextVersion.address),
        position.token.balanceOf(vnlV1Router02.address),
        vnlV1Router02.tokenPriceData(this.tokenOwner.address, position.token.address),
      ])
      expect(nextVersionBalance).to.equal(tokenModel.balanceOf(nextVersion.address))
      expect(custodyBalance).to.equal(tokenModel.balanceOf(vnlV1Router02.address))
      expect(oldPosition.tokenSum).to.equal(0)
      expect(oldPosition.ethSum).to.equal(0)
      expect(oldPosition.weightedBlockSum).to.equal(0)
      expect(oldPosition.latestBlock).to.equal(0)
      // we just use an event to verify that current router calls the next version with correct arguments
      await expect(operation).to.emit(nextVersion, "MigrationParams").withArgs(
        this.tokenOwner.address, position.token.address, position.ethSum, position.tokenSum, position.weightedBlockSum, position.latestBlock)
    }
  }

  toString (): string {
    return `trader ${len6(this.tokenOwner)} migrates tokens ${this.tokens.map(len6)}`
  }
}

// explicitly not extending TransactionCommand
export class IncreaseBlockTimeStamp implements AsyncCommand<VanillaTestModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly provider: JsonRpcProvider, readonly seconds: number) {
  }

  check = (): boolean => true

  run = async (expected: VanillaTestModel, real: VanillaTestSystem): Promise<void> => {
    let newTime = await real.timeFromLatest(this.seconds)
    await this.provider.send("evm_setNextBlockTimestamp", [newTime])
    expected.blockTime = newTime
  }

  toString (): string {
    return `increase block.timestamp by ${this.seconds} seconds`
  }
}
