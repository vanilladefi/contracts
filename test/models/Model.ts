import {
  VanillaV1MigrationState,
  VanillaV1Safelist01,
  VanillaV1Token01,
  VanillaV1Token02,
} from "../../typechain/vanilla_v1.1"
import { utils, Wallet } from "ethers"

export type TokenBalance = {
  [address: string]: bigint
}
export type TokenModel = {
  conversionDeadline: number,
  snapshotBlockNumber: number,
  owner: string,
  total: bigint,
  balances: TokenBalance,
  migrationStateRoot: string,
  snapshotCount: number,
  allowances: { [target: string]: TokenBalance },
}

export type VanillaModel = {
  v1Token01: TokenModel,
  v1Token02: TokenModel,
  nextVersion: string,
  safelisted: string[],
  notsafelisted: string[],
}
export type VanillaTestSystem = {
  vanillaV1Token01: VanillaV1Token01,
  vanillaV1Token02: VanillaV1Token02,
  migrationState: VanillaV1MigrationState,
  safelist: VanillaV1Safelist01
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const allowances = (tokenModel: TokenModel) => ({
  set (source: string, spender: string, amount: bigint): void {
    let update: { [address: string]: bigint } = {}
    update[spender] = amount

    tokenModel.allowances[source] = { ...(tokenModel.allowances[source] || {}), ...update }
  },
  add (source: string, spender: string, amount: bigint): void {
    if (tokenModel.allowances[source] && tokenModel.allowances[source][spender]) {
      tokenModel.allowances[source][spender] += amount
    } else if (amount < 0) {
      throw new Error("Cannot decrement from nonexistent value")
    } else {
      allowances(tokenModel).set(source, spender, amount)
    }
  },
  get (source: string, spender: string): bigint {
    if (!tokenModel.allowances[source]) {
      return 0n
    }

    if (!tokenModel.allowances[source][spender]) {
      return 0n
    }

    return tokenModel.allowances[source][spender]
  },
})
export const initializeTokenModel = (owner: Wallet, wallets: Wallet[], conversionDeadline = 0): TokenModel => {
  let toZeroBalance = (balances: TokenBalance, wallet: Wallet) => {
    balances[wallet.address] = 0n
    return balances
  }
  let balances: TokenBalance = wallets.reduce(toZeroBalance, {})
  return {
    owner: owner.address,
    total: 0n,
    balances,
    snapshotCount: 0,
    snapshotBlockNumber: 0,
    conversionDeadline,
    migrationStateRoot: utils.hexZeroPad("0x0", 32),
    allowances: {},
  }
}

export const initializeTestModel = (setup: Partial<VanillaModel>): VanillaModel => {
  let v1Token01: TokenModel = {
    allowances: {},
    balances: {},
    conversionDeadline: 0,
    migrationStateRoot: "",
    owner: "",
    snapshotBlockNumber: 0,
    snapshotCount: 0,
    total: 0n,
  }
  let v1Token02: TokenModel = {
    allowances: {},
    balances: {},
    conversionDeadline: 0,
    migrationStateRoot: "",
    owner: "",
    snapshotBlockNumber: 0,
    snapshotCount: 0,
    total: 0n,
  }
  let defaultModel: VanillaModel = {
    nextVersion: "",
    notsafelisted: [],
    safelisted: [],
    v1Token01,
    v1Token02,
  }
  return { ...defaultModel, ...setup }
}
