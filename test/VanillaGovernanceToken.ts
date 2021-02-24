import { ethers, waffle } from "hardhat"
import { BigNumber, Signer, Wallet } from "ethers"
import { expect, use } from "chai"
import { waffleChai } from "@ethereum-waffle/chai"
import VanillaGovernanceToken from "../artifacts/contracts/VanillaGovernanceToken.sol/VanillaGovernanceToken.json"

use(waffleChai)
const { provider, deployContract, createFixtureLoader } = waffle
const loadFixture = createFixtureLoader(provider.getWallets(), provider)

describe("Governance Token", () => {
  const ACCESS_DENIED_CODE = "c1"
  async function fixture ([owner, user]: Wallet[]) {
    const governanceToken = await deployContract(owner, VanillaGovernanceToken)
    return { governanceToken, owner, user }
  }

  it("tokens can be minted by the owner", async () => {
    const { governanceToken: token, owner, user } = await loadFixture(fixture)

    const expected = BigNumber.from(250)
    await expect(token.mint(user.address, expected)).not.to.be.revertedWith(ACCESS_DENIED_CODE)
    const reward = await token.connect(user.address).balanceOf(user.address)

    expect(reward).to.equal(expected)
  })

  it("tokens cannot be minted by others", async () => {
    const { governanceToken, user } = await loadFixture(fixture)
    await expect(governanceToken.connect(user).mint(user.address, BigNumber.from(100))).to.be.revertedWith(ACCESS_DENIED_CODE)
  })
})
