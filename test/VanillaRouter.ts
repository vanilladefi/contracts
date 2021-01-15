import { ethers, waffle, upgrades } from "hardhat"
import { expect } from "chai"
import { Contract, Wallet, BigNumber, constants, Signer } from "ethers"
import { deployTokens, setupUniswapRouter, ethInWei, logGasUsage } from "./UniswapSetup"

import VanillaRouter from "../artifacts/contracts/VanillaRouter.sol/VanillaRouter.json"

const { MaxUint256 } = constants
const { provider, deployContract } = waffle

describe("UniswapRouter", async () => {
  it("Buying and selling works", async () => {
    const [vanillaOwner, ourUniswap, tokenDeployer, custody, trader] = provider.getWallets()
    let { tokenA, WETH } = await deployTokens(tokenDeployer)

    // The upgradable registry is deployed with a proxy

    let { router: uniswapRouter } = await setupUniswapRouter(vanillaOwner, ourUniswap, tokenA, WETH)
    let router = await deployContract(vanillaOwner, VanillaRouter, [uniswapRouter.address, ethInWei(100)])
    await logGasUsage("Router-deploy", router.deployTransaction)

    console.log("Router deployed")

    await logGasUsage("Router-depositBuy", await router.connect(trader).depositAndBuy(tokenA.address, 493, MaxUint256, { value: ethInWei(5) }))
    await logGasUsage("Router-sellWithdraw", await router.connect(trader).sellAndWithdraw(tokenA.address, 493, ethInWei(4), MaxUint256))
    let ethAmount = ethInWei(5)
    await WETH.connect(trader).deposit({ value: ethAmount })
    await WETH.connect(trader).approve(router.address, ethAmount)
    await logGasUsage("Router-buy", await router.connect(trader).buy(tokenA.address, ethAmount, 493, MaxUint256))
    await logGasUsage("Router-sell", await router.connect(trader).sell(tokenA.address, 493, ethInWei(4), MaxUint256))
  })
})
