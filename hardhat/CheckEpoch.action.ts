import { HardhatRuntimeEnvironment } from "hardhat/types"

export default async (_: never, { network, ethers, artifacts, deployments }: HardhatRuntimeEnvironment): Promise<void> => {
  const { get } = deployments
  let { abi } = await artifacts.readArtifact("VanillaRouter")

  try {
    console.log(`Checking VanillaRouter deployment in '${network.name}':`)
    let { address } = await get("VanillaRouter")
    let router = new ethers.Contract(address, abi, await ethers.getNamedSigner("deployer"))
    let epoch = await router.epoch()
    console.log(`VanillaRouter deployed in ${address}, at block ${epoch.toNumber()}`)
  } catch (e) {
    console.error(e)
  }
}
