import { AsyncCommand } from "fast-check/lib/types/fast-check-default"
import { allowances, TokenModel, VanillaModel, VanillaTestSystem } from "./Model"
import { BigNumber, constants, Wallet } from "ethers"
import { bn, executeAndLog, expect, len6 } from "../test.util"
import { VanillaV1Token01, VanillaV1Token02 } from "../../typechain/vanilla_v1.1"

const approve = async (command: Approve01 | Approve02, expected: TokenModel, tokenContract: VanillaV1Token01 | VanillaV1Token02) => {
  let value
  if (command.amount !== constants.MaxUint256) {
    value = BigInt(command.amount as number) * expected.balances[command.sender.address] / 100n
  } else {
    value = BigInt(command.amount.toHexString())
  }
  let operation = executeAndLog(command, tokenContract.connect(command.source).approve(command.sender.address, bn(value)))
  let { set: setAllowance, get: getAllowance } = allowances(expected)
  await expect(operation).to.not.be.reverted

  setAllowance(command.source.address, command.sender.address, value)

  expect(await tokenContract.allowance(command.source.address, command.sender.address)).to.equal(getAllowance(command.source.address, command.sender.address))
  expect(await tokenContract.totalSupply()).to.equal(expected.total)
}

export class Approve01 implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly sender: Wallet, readonly source: Wallet, readonly amount: number | BigNumber) {
  }

  check = (): boolean => true;

  run = async ({ v1Token01 }: VanillaModel, { vanillaV1Token01 }: VanillaTestSystem): Promise<void> => {
    await approve(this, v1Token01, vanillaV1Token01)
  };

  toString (): string {
    return `01: approve ${len6(this.sender)} to spend ${this.amount === constants.MaxUint256 ? "max" : `${this.amount}%`} from ${len6(this.source)})`
  }
}

export class Approve02 implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly sender: Wallet, readonly source: Wallet, readonly amount: number | BigNumber) {
  }

  check = (): boolean => true;

  run = async ({ v1Token02 }: VanillaModel, { vanillaV1Token02 }: VanillaTestSystem): Promise<void> => {
    await approve(this, v1Token02, vanillaV1Token02)
  };

  toString (): string {
    return `02: approve ${len6(this.sender)} to spend ${this.amount} from ${len6(this.source)})`
  }
}
