import { TokenModel, VanillaModel, VanillaTestSystem } from "./Model"
import { VanillaV1Token01, VanillaV1Token02 } from "../../typechain/vanilla_v1.1"
import { bn, executeAndLog, expect, len6 } from "../test.util"
import { AsyncCommand } from "fast-check/lib/types/fast-check-default"
import { Wallet } from "ethers"

const mint = async (command: Mint01 | Mint02, expected: TokenModel, tokenContract: VanillaV1Token01 | VanillaV1Token02) => {
  let operation = executeAndLog(command, tokenContract.connect(command.minter).mint(command.receiver.address, bn(command.value)))
  if (command.minter.address !== command.realOwner.address) {
    await expect(operation).to.be.revertedWith("c1")
    return
  }
  await expect(operation).to.not.be.reverted

  expected.total += command.value
  expected.balances[command.receiver.address] += command.value

  expect(await tokenContract.balanceOf(command.receiver.address)).to.equal(expected.balances[command.receiver.address])
  expect(await tokenContract.totalSupply()).to.equal(expected.total)
}

export class Mint01 implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly value: bigint, readonly realOwner: Wallet, readonly minter: Wallet, readonly receiver: Wallet) {
  }

  check = (): boolean => true;

  run = async ({ v1Token01 }: VanillaModel, { vanillaV1Token01 }: VanillaTestSystem): Promise<void> => {
    await mint(this, v1Token01, vanillaV1Token01)
  };

  toString (): string {
    return `01: mint ${this.value} to ${len6(this.receiver)}`
  }
}

export class Mint02 implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly value: bigint, readonly realOwner: Wallet, readonly minter: Wallet, readonly receiver: Wallet) {
  }

  check = (): boolean => true;

  run = async ({ v1Token02 }: VanillaModel, { vanillaV1Token02 }: VanillaTestSystem): Promise<void> => {
    await mint(this, v1Token02, vanillaV1Token02)
  };

  toString (): string {
    return `02: mint ${this.value} to ${len6(this.receiver)}`
  }
}
