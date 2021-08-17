/* eslint-disable camelcase */
import { BigNumber, constants, Wallet } from "ethers"
import { MockERC20, MockERC20__factory, VanillaV1Safelist01__factory } from "../typechain/vanilla_v1.1"
import {
  assert,
  asyncModelRun,
  asyncProperty,
  bigUintN,
  commands,
  constant,
  oneof,
  shuffledSubarray,
  tuple,
} from "fast-check"
import { ethers, waffle } from "hardhat"
import { initializeTestModel } from "./models/Model"
import { ApproveNextVersion, ModifySafelist, QuerySafeListState } from "./models/ModifySafelistState"

const { provider, createFixtureLoader } = waffle
const loadFixture = createFixtureLoader(provider.getWallets(), provider)

describe("Token safelist model", () => {
  async function fixture (wallets: Wallet[]) {
    let [safelistOwner, tokenOwner, ...others] = wallets
    const safelist = await new VanillaV1Safelist01__factory(safelistOwner).deploy(safelistOwner.address)
    let tokenFactory = new MockERC20__factory(tokenOwner)

    let tokens = []
    for (let i = 1; i < 10; i++) {
      let token = await tokenFactory.deploy(`Token ${i}`, `T${i}`, 18, BigNumber.from(100n * 10n ** 18n))
      tokens.push(token)
    }
    return {
      tokens,
      safelist,
      deployers: { safelistOwner, tokenOwner },
      users: others,
    }
  }

  it("invariants hold", async () => {
    const { deployers, users, tokens } = await loadFixture(fixture)
    const { safelistOwner } = deployers
    let tokenAddrs: string[] = tokens.map((t: MockERC20) => t.address)
    let addedAndRemoved = tuple(shuffledSubarray(tokenAddrs), shuffledSubarray(tokenAddrs))
    let modifiers = [safelistOwner, ...users].map(constant)
    let randomAddress = bigUintN(160).map(n => ethers.utils.getAddress(ethers.utils.hexZeroPad("0x" + n.toString(16), 20))).noShrink()
    let transitions = [
      tuple(addedAndRemoved, oneof(...modifiers)).map(([[added, removed], modifier]) => new ModifySafelist(added, removed, safelistOwner, modifier)),
      tuple(randomAddress, oneof(...modifiers)).map(([address, modifier]) => new ApproveNextVersion(address, safelistOwner, modifier)),
      oneof(...modifiers).map(caller => new QuerySafeListState(caller)),
    ]

    let constraints = { replayPath: ":" }
    let runnerParams = {
      seed: new Date().getTime(),
      path: "0",
      endOnFailure: true,
    }
    // constraints = { replayPath: "Sbs:F" }
    // runnerParams = { seed: 1379422813, path: "36:5:11:9:7:6", endOnFailure: true }

    let shrinking = false
    let run = 1
    await assert(asyncProperty(commands(transitions, { maxCommands: 300, ...constraints }), async (cmds) => {
      const initialState = async () => {
        console.log(shrinking ? `\tTest failed, SHRINKING (seed ${runnerParams.seed})` : `\tStarting run #${run}`)
        let { safelist } = await loadFixture(fixture)
        return {
          model: initializeTestModel({
            safelisted: [],
            notsafelisted: [...tokens.map(t => t.address)],
            nextVersion: constants.AddressZero,
          }),
          real: { safelist },
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
    }), { numRuns: 10, ...runnerParams })
  })
})
