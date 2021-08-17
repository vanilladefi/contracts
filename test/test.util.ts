import { Block, Provider, TransactionReceipt } from "@ethersproject/providers"
import { BigNumber, ContractTransaction, Event, EventFilter } from "ethers"
import { AsyncCommand } from "fast-check/lib/types/fast-check-default"
import { expect, use } from "chai"
import { waffleChai } from "@ethereum-waffle/chai"
import { Decimal } from "decimal.js"
import { ethers } from "hardhat"

use(waffleChai)

export { expect }

export const fetchBlock = async (provider: Provider, operation?: Promise<ContractTransaction>): Promise<Block> => {
  if (operation) {
    let contractTransaction = await operation
    let contractReceipt = await contractTransaction.wait()
    return await provider.getBlock(contractReceipt.blockNumber)
  } else {
    return await provider.getBlock("latest")
  }
}

export const objectValues = <T extends BigNumber | unknown> (expected: {[key: string]: T}) => (actual: {[key: string]: T}): boolean => {
  for (const [key, expectedValue] of Object.entries(expected)) {
    let actualValue = actual[key]
    if ("eq" in (actualValue as BigNumber)) {
      if (!(actualValue as BigNumber).eq(expectedValue as BigNumber)) {
        return false
      }
    } else if (actualValue !== expectedValue) {
      return false
    }
  }
  return true
}
export const executeAndLog = async (cmd: AsyncCommand<never, never>, contractTransaction: Promise<ContractTransaction>): Promise<ContractTransaction> => {
  let tx = await contractTransaction
  // console.log("Run", (await tx.wait()).blockNumber, cmd.toString())
  return contractTransaction
}
export const bn = BigNumber.from
export type TokenAmount = bigint | BigNumber
export const toInt = (amount: TokenAmount): bigint => typeof amount === "bigint" ? amount : BigInt(amount.toHexString())
export const pretty = (amount: TokenAmount, decimals = 18, show = 6): string => new Decimal(amount.toString()).div(10 ** decimals).toFixed(show)
export const shorten = (length: number) => (address: string | { address: string }): string => (typeof address === "string" ? address : address.address).substring(0, "0x".length + length)
export const len6 = shorten(6)
const txCost = (tx: ContractTransaction, receipt: TransactionReceipt) => {
  if (!tx.gasPrice) {
    return receipt.effectiveGasPrice.mul(receipt.gasUsed)
  }
  return tx.gasPrice.mul(receipt.gasUsed)
}
export const receipt = async (operation: Promise<ContractTransaction | undefined>,
  eventFilters?: ((...args: never[]) => EventFilter)[],
  txFilter?: (tx: TransactionReceipt) => boolean): Promise<{txCost: BigNumber, blockNumber: number, events: Event[], operation: Promise<ContractTransaction | undefined>}> => {
  try {
    let tx = await operation
    if (!tx) {
      return {
        txCost: BigNumber.from(0),
        blockNumber: 0,
        events: [],
        operation,
      }
    }
    let receipt = await tx.wait()

    let events: Event[] = []
    if (eventFilters && receipt.events) {
      let filterTopicSet = new Set(eventFilters.flatMap(filter => filter().topics))
      events = receipt.events.filter(event => event.topics.filter(topic => filterTopicSet.has(topic)).length > 0)
    }
    return {
      txCost: txCost(tx, receipt),
      blockNumber: receipt.blockNumber,
      events,
      operation,
    }
  } catch (e) {
    let block = await ethers.provider.getBlock("latest")
    let txDetails = await Promise.all(block.transactions.map(tx => Promise.all([
      ethers.provider.getTransaction(tx), ethers.provider.getTransactionReceipt(tx)])))

    if (txDetails.length > 1) {
      if (!txFilter) throw new Error("Multiple tx's in the block, provide a txfilter")
      txDetails = txDetails.filter(([, receipt]) => txFilter(receipt))
    }
    let [[tx, receipt]] = txDetails
    return {
      txCost: txCost(tx, receipt),
      blockNumber: receipt.blockNumber,
      events: [],
      operation,
    }
  }
}
