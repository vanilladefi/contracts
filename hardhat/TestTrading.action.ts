/* eslint-disable camelcase */
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { tokenAddress } from "../utils/safelists"
import Decimal from "decimal.js"
import { BigNumber, constants } from "ethers"
import { VanillaV1Router02__factory } from "../typechain/vanilla_v1.1"

export default async (_:never, { ethers, deployments }: HardhatRuntimeEnvironment): Promise<void> => {
  const { get } = deployments
  const deployer = await ethers.getNamedSigner("deployer")

  let { address: router02 } = await get("VanillaV1Router02")

  let vanilla = VanillaV1Router02__factory.connect(router02, ethers.provider)

  let _10eth = BigNumber.from(10n * (10n ** 18n))
  let uniAddress = tokenAddress("UNI")
  console.log("Executing UNI buy and sell", router02)
  let allUni
  {
    let tx = await vanilla.connect(deployer).executePayable([vanilla.interface.encodeFunctionData("buy",
      [{
        token: uniAddress,
        fee: 500,
        numToken: 1,
        numEth: _10eth,
        blockTimeDeadline: constants.MaxUint256,
        useWETH: false,
      }])], { value: _10eth })

    let { gasUsed } = await tx.wait()
    let { ethSum, tokenSum } = await vanilla.tokenPriceData(deployer.address, uniAddress)
    allUni = tokenSum
    console.log("Buy successful", `owner=${deployer.address}`,
      `ethSum=${new Decimal(ethSum.toHexString()).dividedBy(10 ** 18).toDecimalPlaces(4)}`,
      `tokenSum=${new Decimal(tokenSum.toHexString()).dividedBy(10 ** 18).toDecimalPlaces(4)}`, `gasUsed=${gasUsed}`)
  }

  {
    let tx = await vanilla.connect(deployer).executePayable([
      vanilla.interface.encodeFunctionData("sell",
        [{
          token: uniAddress,
          fee: 500,
          numToken: allUni,
          numEth: 1,
          blockTimeDeadline: constants.MaxUint256,
          useWETH: false,
        }]),
    ])
    let { gasUsed } = await tx.wait()
    let { ethSum, tokenSum } = await vanilla.tokenPriceData(deployer.address, uniAddress)
    console.log("Sell successful", `owner=${deployer.address}`,
      `ethSum=${new Decimal(ethSum.toHexString()).dividedBy(10 ** 18).toDecimalPlaces(4)}`,
      `tokenSum=${new Decimal(tokenSum.toHexString()).dividedBy(10 ** 18).toDecimalPlaces(4)}`, `gasUsed=${gasUsed}`)
  }
}
