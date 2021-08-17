import { AsyncCommand } from "fast-check/lib/types/fast-check-default"
import { VanillaModel, VanillaTestSystem } from "./Model"
import { Wallet } from "ethers"
import { executeAndLog, expect } from "../test.util"

export class ModifySafelist implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly added: string[], readonly removed: string[], readonly realOwner: Wallet, readonly modifier: Wallet) {
  }

  check = (): boolean => true;

  run = async (expected: VanillaModel, { safelist: real }: VanillaTestSystem): Promise<void> => {
    let operation = executeAndLog(this, real.connect(this.modifier).modify(this.added, this.removed))
    if (this.realOwner.address !== this.modifier.address) {
      await expect(operation).to.be.revertedWith("UnauthorizedAccess()")
      return
    }
    await expect(operation).to.not.be.reverted
    if (this.added.length) {
      await expect(operation).to.emit(real, "TokensAdded").withArgs(this.added)
    } else {
      await expect(operation).to.not.emit(real, "TokensAdded").withArgs(this.added)
    }
    if (this.removed.length) {
      await expect(operation).to.emit(real, "TokensRemoved").withArgs(this.removed)
    } else {
      await expect(operation).to.not.emit(real, "TokensRemoved").withArgs(this.removed)
    }

    let removed = new Set(...this.removed)
    expected.safelisted = expected.safelisted.concat(this.added).filter(addr => removed.has(addr))

    let added = new Set(...this.added)
    expected.notsafelisted = expected.notsafelisted.concat(this.removed).filter(addr => added.has(addr))

    for (const address of this.removed) {
      expect(await real.isSafelisted(address)).to.equal(false)
    }
    for (const address of expected.safelisted) {
      expect(await real.isSafelisted(address)).to.equal(true, `${address} not safelisted`)
    }
  };

  toString (): string {
    return `safelist.modify: add ${this.added}, remove ${this.removed}, by ${this.modifier.address}`
  }
}

export class QuerySafeListState implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly caller: Wallet) {
  }

  check = (): boolean => true;

  run = async (expected: VanillaModel, { safelist: real }: VanillaTestSystem): Promise<void> => {
    let [nextVersion, safelist, notsafelist] = await Promise.all([
      real.nextVersion(),
      Promise.all(expected.safelisted.map(address => real.connect(this.caller).isSafelisted(address).then((safelisted) => ({
        address,
        safelisted,
      })))),
      Promise.all(expected.notsafelisted.map(address => real.connect(this.caller).isSafelisted(address).then((safelisted) => ({
        address,
        safelisted,
      })))),
    ])

    expect(nextVersion).to.equal(expected.nextVersion)
    for (const { address, safelisted } of safelist) {
      expect(expected.safelisted).to.contain(address)
      expect(safelisted).to.equal(true)
    }
    for (const { address, safelisted } of notsafelist) {
      expect(expected.notsafelisted).to.contain(address)
      expect(safelisted).to.equal(false)
    }
  };

  toString (): string {
    return `safelist.query: by ${this.caller.address}`
  }
}

export class ApproveNextVersion implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly nextVersion: string, readonly realOwner: Wallet, readonly modifier: Wallet) {
  }

  check = (): boolean => true;

  run = async (expected: VanillaModel, { safelist: real }: VanillaTestSystem): Promise<void> => {
    let operation = executeAndLog(this, real.connect(this.modifier).approveNextVersion(this.nextVersion))
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
