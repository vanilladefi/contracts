import { ethers } from "hardhat"
import { BigNumber, Signer } from "ethers"
import { expect } from "chai"

describe("Governance Token", () => {
  let owner: Signer
  let ownerAddress: string
  let signers: Signer[]

  beforeEach(async () => {
    signers = await ethers.getSigners()
    owner = signers[0]
    ownerAddress = await owner.getAddress()
  })

  it("Should be able to mint governance tokens using the minting curve", async () => {
    const GovernanceToken = await ethers.getContractFactory("VanillaGovernanceToken")

    const governanceToken = await GovernanceToken.deploy()
    await governanceToken.deployed()

    const testReward = BigNumber.from(250)

    await governanceToken.mint(ownerAddress, testReward)

    let reward:BigNumber = await governanceToken.balanceOf(ownerAddress)
    expect(reward.toHexString()).to.equal(testReward.toHexString())
  })
})
