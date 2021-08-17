/* eslint-disable camelcase */
import { Wallet } from "ethers"
import {
  VanillaV1MigrationState__factory,
  VanillaV1Token01,
  VanillaV1Token02__factory,
} from "../typechain/vanilla_v1.1"
import VanillaV1Token01Artifact from "./v1-artifacts/VanillaGovernanceToken.json"
import {
  Arbitrary,
  assert,
  asyncModelRun,
  asyncProperty,
  bigUintN,
  commands,
  constant,
  integer,
  oneof,
  shuffledSubarray,
  tuple,
} from "fast-check"
import { ethers, waffle } from "hardhat"
import { IncreaseBlockTimestamp } from "./models/IncreaseBlockTimestamp"
import { initializeTestModel, initializeTokenModel } from "./models/Model"
import { Mint01, Mint02 } from "./models/MintVNL"
import { Transfer01 } from "./models/TransferVNL"
import { ConversionSnapshot01, TokenConversion01 } from "./models/MigrateVNL"

const { provider, deployContract, createFixtureLoader } = waffle
const { provider: networkProvider } = ethers
const loadFixture = createFixtureLoader(provider.getWallets(), provider)

describe("Token state model", () => {
  async function fixture (wallets: Wallet[]) {
    let [v1Migration, v1Token01, v1Token02] = wallets.slice(0, 3)
    const migrationState = await new VanillaV1MigrationState__factory(v1Migration).deploy(v1Migration.address)
    const vanillaV1Token01 = await deployContract(v1Token01, VanillaV1Token01Artifact) as VanillaV1Token01
    const vanillaV1Token02 = await new VanillaV1Token02__factory(v1Token02).deploy(migrationState.address, vanillaV1Token01.address)
    return { vanillaV1Token02, vanillaV1Token01, migrationState, deployers: { v1Token02, v1Token01, v1Migration }, users: wallets.slice(3, 6) }
  }

  it("invariants hold", async () => {
    const { deployers, users: [a, b, c] } = await loadFixture(fixture)
    const { v1Token01, v1Migration, v1Token02 } = deployers
    let percentages = [25, 50, 75, 100, 150].map(constant)
    // let approvePercentages = [50, 100, constants.MaxUint256].map(constant)
    const addresses = [a, b, c, v1Token01, v1Token02, v1Migration]
    const users = [a, b, c].map(constant)
    const fixedNumberOf = <T>(things: T[]) => (num: number): Arbitrary<T[]> => shuffledSubarray(things, { minLength: num, maxLength: num })
    const anyTwoAddress = fixedNumberOf(addresses)(2)
    let transitions = [
      tuple(bigUintN(64).noShrink(), anyTwoAddress).map(
        ([amount, [minter, receiver]]) => new Mint01(amount, v1Token01, minter, receiver)),
      tuple(bigUintN(64).noShrink(), anyTwoAddress).map(
        ([amount, [minter, receiver]]) => new Mint02(amount, v1Token02, minter, receiver)),
      tuple(anyTwoAddress, oneof(...percentages)).map(([[first, second], pct]) => new Transfer01(first, second, pct)),
      oneof(...addresses.map(constant)).map((user) => new ConversionSnapshot01(v1Migration, user)),
      oneof(...users).map((user) => new TokenConversion01(user)),
      integer(1, 30).map(days => new IncreaseBlockTimestamp(networkProvider, days)),
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
    await assert(asyncProperty(commands(transitions, { maxCommands: 50, ...constraints }), async (cmds) => {
      const initialState = async () => {
        console.log(shrinking ? `\tTest failed, SHRINKING (seed ${runnerParams.seed})` : `\tStarting run #${run}`)
        let { vanillaV1Token01, vanillaV1Token02, migrationState } = await loadFixture(fixture)
        let conversionDeadline = await migrationState.conversionDeadline()
        return {
          model: initializeTestModel({
            v1Token01: initializeTokenModel(v1Token01, addresses, conversionDeadline.toNumber()),
            v1Token02: initializeTokenModel(v1Token02, addresses),
          }),
          real: { vanillaV1Token01, vanillaV1Token02, migrationState },
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
    }), { numRuns: 50, ...runnerParams })
  })
})
