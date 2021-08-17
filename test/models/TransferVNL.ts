import { AsyncCommand } from "fast-check/lib/types/fast-check-default"
import { allowances, TokenModel, VanillaModel, VanillaTestSystem } from "./Model"
import { Wallet } from "ethers"
import { bn, executeAndLog, expect, len6 } from "../test.util"
import { VanillaV1Token01, VanillaV1Token02 } from "../../typechain/vanilla_v1.1"

const transfer = async (command: Transfer01 | Transfer02, expected: TokenModel, tokenContract: VanillaV1Token01 | VanillaV1Token02) => {
  let amount = BigInt(command.percentage) * expected.balances[command.sender.address] / 100n

  let operation = executeAndLog(command, tokenContract.connect(command.sender).transfer(command.receiver.address, bn(amount)))
  if (expected.balances[command.sender.address] < amount) {
    await expect(operation).to.be.revertedWith("ERC20: transfer amount exceeds balance")
    return
  }
  await expect(operation).to.not.be.reverted

  expected.balances[command.receiver.address] += amount
  expected.balances[command.sender.address] -= amount

  expect(await tokenContract.balanceOf(command.receiver.address)).to.equal(expected.balances[command.receiver.address])
  expect(await tokenContract.balanceOf(command.sender.address)).to.equal(expected.balances[command.sender.address])
  expect(await tokenContract.totalSupply()).to.equal(expected.total)
}

export class Transfer01 implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly sender: Wallet, readonly receiver: Wallet, readonly percentage: number) {
  }

  check = (): boolean => true;

  run = async ({ v1Token01 }: VanillaModel, { vanillaV1Token01 }: VanillaTestSystem): Promise<void> => {
    await transfer(this, v1Token01, vanillaV1Token01)
  };

  toString (): string {
    return `01: transfer ${this.percentage}% to ${len6(this.receiver)} from ${len6(this.sender)}`
  }
}

export class Transfer02 implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly sender: Wallet, readonly receiver: Wallet, readonly percentage: number) {
  }

  check = (): boolean => true;

  run = async ({ v1Token02 }: VanillaModel, { vanillaV1Token02 }: VanillaTestSystem): Promise<void> => {
    await transfer(this, v1Token02, vanillaV1Token02)
  };

  toString (): string {
    return `02: transfer ${this.percentage}% to ${len6(this.receiver)} from ${len6(this.sender)}`
  }
}

const transferFrom = async (command: TransferFrom01 | TransferFrom02, expected: TokenModel, tokenContract: VanillaV1Token01 | VanillaV1Token02) => {
  let { get: getAllowance, add: addAllowance } = allowances(expected)

  let amount = BigInt(command.pct) * expected.balances[command.source.address] / 100n
  let sufficientBalance = expected.balances[command.source.address] >= amount
  let sufficientAllowance = amount === 0n || getAllowance(command.source.address, command.sender.address) >= amount
  let operation = executeAndLog(command, tokenContract.connect(command.sender).transferFrom(command.source.address, command.target.address, bn(amount)))
  if (!sufficientAllowance && sufficientBalance) {
    await expect(operation).to.be.revertedWith("ERC20: transfer amount exceeds allowance")
    return
  }
  if (!sufficientBalance) {
    await expect(operation).to.be.revertedWith("ERC20: transfer amount exceeds balance")
    return
  }

  await expect(operation).to.not.be.reverted

  expected.balances[command.source.address] -= amount
  expected.balances[command.target.address] += amount
  expect(await tokenContract.balanceOf(command.source.address)).to.equal(expected.balances[command.source.address])
  expect(await tokenContract.balanceOf(command.target.address)).to.equal(expected.balances[command.target.address])

  addAllowance(command.source.address, command.sender.address, -amount)
  expect(await tokenContract.allowance(command.source.address, command.sender.address)).to.equal(getAllowance(command.source.address, command.sender.address))
  expect(await tokenContract.totalSupply()).to.equal(expected.total)
}

export class TransferFrom01 implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly sender: Wallet, readonly source: Wallet, readonly target: Wallet, readonly pct: number) {
  }

  check = (): boolean => true;

  run = async ({ v1Token01 }: VanillaModel, { vanillaV1Token01 }: VanillaTestSystem) : Promise<void> => {
    await transferFrom(this, v1Token01, vanillaV1Token01)
  };

  toString (): string {
    return `01: transfer ${this.pct}% from ${len6(this.source)} to ${len6(this.target)} (by ${len6(this.sender)})`
  }
}

export class TransferFrom02 implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly sender: Wallet, readonly source: Wallet, readonly target: Wallet, readonly pct: number) {
  }

  check = (): boolean => true;

  run = async ({ v1Token02 }: VanillaModel, { vanillaV1Token02 }: VanillaTestSystem): Promise<void> => {
    await transferFrom(this, v1Token02, vanillaV1Token02)
  };

  toString (): string {
    return `02: transfer ${this.pct}% from ${len6(this.source)} to ${len6(this.target)} (by ${len6(this.sender)})`
  }
}
