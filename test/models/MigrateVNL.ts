import { AsyncCommand } from "fast-check/lib/types/fast-check-default"
import { allowances, VanillaModel, VanillaTestSystem } from "./Model"
import { BigNumber, constants, Wallet } from "ethers"
import { AddressBalance, snapshot } from "../../utils/conversion.util"
import { executeAndLog, expect, fetchBlock, len6 } from "../test.util"

export class ConversionSnapshot01 implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly realOwner: Wallet, readonly converter: Wallet) {
  }

  check = (): boolean => true;

  run = async ({ v1Token01: expected }: VanillaModel, { vanillaV1Token01, vanillaV1Token02, migrationState }: VanillaTestSystem): Promise<void> => {
    let { pending, onchain } = await snapshot(vanillaV1Token01, vanillaV1Token02)

    for (const [address, amount] of Object.entries(pending.state.accounts)) {
      let balance: AddressBalance = { address, amount }
      let snapshotBalance = pending.state.accounts[address] || -1 // using invalid balance just for comparison
      expect(await vanillaV1Token01.balanceOf(address)).to.equal(amount)
      expect(pending.verify(balance)).to.equal(amount.eq(snapshotBalance))

      let wrongBalance: AddressBalance = { address, amount: amount.add(1) }
      expect(pending.verify(wrongBalance)).to.equal(false)
    }

    let operation = executeAndLog(this, migrationState.connect(this.converter).updateConvertibleState(pending.root, pending.state.blockNumber))
    if (this.realOwner.address !== this.converter.address) {
      await expect(operation).to.be.reverted
      // For some reason Hardhat doesn't recognize these custom errors anymore
      // await expect(operation).to.be.revertedWith("UnauthorizedAccess()")
      return
    }
    let { timestamp } = await fetchBlock(vanillaV1Token01.provider)
    if (timestamp > expected.conversionDeadline) {
      await expect(operation).to.be.reverted
      // For some reason Hardhat doesn't recognize these custom errors anymore
      // await expect(operation).to.be.revertedWith("MigrationStateUpdateDisabled()")
      return
    }
    await expect(operation).to.not.be.reverted
    let { timestamp: opTimestamp } = await fetchBlock(vanillaV1Token01.provider, operation)

    const _30days = 30 * 24 * 60 * 60
    expected.conversionDeadline = opTimestamp + _30days
    expected.migrationStateRoot = pending.root
    expected.snapshotBlockNumber = pending.state.blockNumber
    expected.snapshotCount++

    expect(await migrationState.stateRoot()).to.equal(expected.migrationStateRoot)
    expect(await migrationState.blockNumber()).to.equal(expected.snapshotBlockNumber)
    expect(await migrationState.conversionDeadline()).to.equal(expected.conversionDeadline)
    // console.log(`  - new conversion deadline ${new Date(expected.conversionDeadline * 1000).toISOString()}`)
  };

  toString (): string {
    return `01: update snapshot by ${len6(this.converter)}`
  }
}

export class TokenConversion01 implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly converter: Wallet) {
  }

  check = (): boolean => true;

  run = async ({ v1Token01, v1Token02 }: VanillaModel, {
    vanillaV1Token02,
    migrationState,
    vanillaV1Token01,
  }: VanillaTestSystem): Promise<void> => {
    let { pending, onchain } = await snapshot(vanillaV1Token01, vanillaV1Token02)
    if (v1Token01.snapshotBlockNumber > 0) {
      expect(onchain.root).to.equal(v1Token01.migrationStateRoot)
    }

    let { get: getAllowance, set: setAllowance } = allowances(v1Token01)

    let address = this.converter.address
    let numTokens = v1Token01.balances[this.converter.address]
    let amount = BigNumber.from(numTokens)
    let balance: AddressBalance = { address, amount }

    let proof = onchain.getProof(balance)
    let eligibleToConvert = onchain.verify(balance)
    let conversionOpen = (await fetchBlock(vanillaV1Token01.provider)).timestamp < v1Token01.conversionDeadline
    let transferApproved = getAllowance(this.converter.address, vanillaV1Token02.address) >= numTokens
    {
      let [convertible, transferable] = await vanillaV1Token02.connect(this.converter).checkEligibility(proof)
      expect([convertible, transferable]).to.eql([eligibleToConvert && conversionOpen, transferApproved && amount.gt(0)])
    }
    await vanillaV1Token01.connect(this.converter).approve(vanillaV1Token02.address, amount)
    setAllowance(this.converter.address, vanillaV1Token02.address, numTokens)

    {
      let [convertible, transferable] = await vanillaV1Token02.connect(this.converter).checkEligibility(proof)
      expect([convertible, transferable]).to.eql([eligibleToConvert && conversionOpen, amount.gt(0)])
    }

    let operation = executeAndLog(this, vanillaV1Token02.connect(this.converter).convertVNL(proof))
    if (!conversionOpen) {
      await expect(operation).to.be.revertedWith("ConversionWindowClosed()")
      return
    }
    if (amount.eq(0)) {
      await expect(operation).to.be.revertedWith("NoConvertibleVNL()")
      return
    }
    expect(await migrationState.stateRoot()).to.equal(v1Token01.migrationStateRoot)
    expect(await migrationState.verifyEligibility(proof, address, amount)).to.equal(eligibleToConvert)
    if (!eligibleToConvert) {
      await expect(operation).to.be.revertedWith("VerificationFailed()")
      return
    }

    await expect(operation).to.not.be.reverted
    await expect(operation).to.emit(vanillaV1Token02, "VNLConverted").withArgs(address, amount)
    await expect(operation).to.emit(vanillaV1Token02, "Transfer").withArgs(constants.AddressZero, address, amount)
    setAllowance(this.converter.address, vanillaV1Token02.address, 0n)
    let mintedAmount = v1Token01.balances[address]
    v1Token02.balances[address] += mintedAmount
    v1Token02.total += mintedAmount
    v1Token01.balances[address] = 0n
    if (!v1Token01.balances[vanillaV1Token02.address]) {
      v1Token01.balances[vanillaV1Token02.address] = 0n
    }
    v1Token01.balances[vanillaV1Token02.address] += mintedAmount

    expect(await vanillaV1Token01.allowance(this.converter.address, vanillaV1Token02.address)).to.equal(getAllowance(this.converter.address, vanillaV1Token02.address))
    expect(await vanillaV1Token01.balanceOf(this.converter.address)).to.equal(0)
    expect(await vanillaV1Token01.balanceOf(vanillaV1Token02.address)).to.equal(v1Token01.balances[vanillaV1Token02.address])
    expect(await vanillaV1Token01.totalSupply()).to.equal(v1Token01.total)

    expect(await vanillaV1Token02.balanceOf(this.converter.address)).to.equal(v1Token02.balances[address])
    expect(await vanillaV1Token02.totalSupply()).to.equal(v1Token02.total)
  };

  toString (): string {
    return `01: convert to 02 by ${len6(this.converter)}`
  }
}
