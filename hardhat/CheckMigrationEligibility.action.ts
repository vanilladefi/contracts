/* eslint-disable camelcase */
import {
  VanillaV1API01__factory,
  VanillaV1MigrationState__factory,
  VanillaV1Router02__factory,
  VanillaV1Token01__factory,
  VanillaV1Token02__factory,
} from "../typechain/vanilla_v1.1"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { snapshot } from "../utils/conversion.util"

type Arguments = { account: string }
export default async ({ account }: Arguments, { ethers, deployments }: HardhatRuntimeEnvironment): Promise<void> => {
  const { get } = deployments

  let { address: router01 } = await get("VanillaV1Router01")
  let { address: router02 } = await get("VanillaV1Router02")
  let { address: migrationState } = await get("VanillaV1MigrationState")

  let VanillaV1Token01 = await VanillaV1Token01__factory.connect(
    await VanillaV1API01__factory.connect(router01, ethers.provider).vnlContract(),
    ethers.provider)
  let VanillaV1Token02 = await VanillaV1Token02__factory.connect(
    await VanillaV1Router02__factory.connect(router02, ethers.provider).vnlContract(),
    ethers.provider)
  let VanillaV1MigrationState = VanillaV1MigrationState__factory.connect(migrationState, ethers.provider)

  let balance = await VanillaV1Token01.balanceOf(account)
  let { onchain } = await snapshot(VanillaV1Token01, VanillaV1Token02)
  let proof = onchain.getProof({ address: account, amount: balance })
  let { convertible, transferable } = await VanillaV1Token02.connect(account).checkEligibility(proof)

  console.log(`VNLv1 balance('${account}') = ${balance}`)
  console.log("| calculated proof", proof)
  console.log("| convertible:", convertible, " transferable:", transferable)
}
