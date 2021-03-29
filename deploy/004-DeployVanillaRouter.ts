import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/dist/types"
import { ExchangeReserveEstimate, queryCrossExchangeLiquidity } from "../utils/DeploymentTools"

const func: DeployFunction = async function ({ ethers, deployments, getNamedAccounts, network }: HardhatRuntimeEnvironment) {
  const { deploy, get, log } = deployments

  const { deployer } = await getNamedAccounts()
  let bn = ethers.BigNumber.from

  let { address: uniswapRouter } = await get("UniswapV2Router02")

  let currentBlockNumber = await ethers.provider.getBlockNumber()
  console.log("Deploying to", network.name, network.config.chainId, currentBlockNumber)

  const RESERVELIMIT_500ETH = bn(500n * (10n ** 18n))

  // when executing npm run node:mainnet-fork, the network.name != "mainnet" so we just check the chainId
  if (network.config.chainId === 1) {
    // We safe-list the token based on its WETH-denominated liquidity status in 3 different markets, Uniswap,
    // Sushiswap and Balancer. This cannot guarantee the safety, but works as a gauge for how much traders generally have
    // at stake in the tokens. We use multiple markets to improve the selection towards tokens whose ownership is
    // potentially more decentralized.
    // See DeploymentTools.ts for details how safe-listed tokens are queried using TheGraph.
    const SAFELIST_CRITERIA = (x: ExchangeReserveEstimate) => x.uniswapReserve > 500 && (x.sushiReserve > 500 || x.balReserve > 250)
    const BLOCKNUMBER_FOR_SAFELIST_SELECTION = 12110000
    const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"

    let safelist = await queryCrossExchangeLiquidity(BLOCKNUMBER_FOR_SAFELIST_SELECTION, WETH_ADDRESS, SAFELIST_CRITERIA)
    log("Safe-listed tokens", safelist.length, safelist.map(x => x.token.symbol))

    // next we try to verify that safelist contents are as expected, so
    // - we have pre-fetched the safelist for the block number 12110000, see the expectedTokens-object below
    // - we calculate a checksum for both pre-fetched addresses and the one api.thegraph.com returns when deploying and verify they are the same
    //   (doing both may be redundant but also reduces the chance that VanillaRouter is deployed with incorrect safelist,
    //    for example when using a wrong Git version or if api.thegraph.com is not working correctly)

    const expectedTokens = {
      AAVE: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
      AMP: "0xff20817765cb7f73d4bde2e66e067e58d11095c2",
      AMPL: "0xd46ba6d942050d489dbd938a2c909a5d5039a161",
      ANT: "0xa117000000f279d81a1d3cc75430faa017fa5a2e",
      arNXM: "0x1337def18c680af1f9f45cbcab6309562975b1dd",
      BAT: "0x0d8775f648430679a709e98d2b0cb6250d2887ef",
      COMP: "0xc00e94cb662c3520282e6f5717214004a7f26888",
      CRV: "0xd533a949740bb3306d119cc777fa900ba034cd52",
      DAI: "0x6b175474e89094c44da98b954eedeac495271d0f",
      DPI: "0x1494ca1f11d487c2bbe4543e90080aeba4ba3c2b",
      GNO: "0x6810e776880c02933d47db1b9fc05908e5386b96",
      LINK: "0x514910771af9ca656af840dff83e8264ecf986ca",
      MKR: "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2",
      OMG: "0xd26114cd6ee289accf82350c8d8487fedb8a0c07",
      REN: "0x408e41876cccdc0f92210600ef50372656052a38",
      RGT: "0xd291e7a03283640fdc51b121ac401383a46cc623",
      SDT: "0x73968b9a57c6e53d41345fd57a6e6ae27d6cdb2f",
      SFI: "0xb753428af26e81097e7fd17f40c88aaa3e04902c",
      SNX: "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f",
      SUPER: "0xe53ec727dbdeb9e2d5456c3be40cff031ab40a55",
      SUSHI: "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2",
      TRU: "0x4c19596f5aaff459fa38b0f7ed92f11ae6543784",
      TUSD: "0x0000000000085d4780b73119b644ae5ecd22b376",
      UMA: "0x04fa0d235c4abf4bcf4787af4cf447de572ef828",
      UNI: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
      USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      VSP: "0x1b40183efb4dd766f11bda7a7c3ad8982e998421",
      WBTC: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
      YFI: "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e",
    }
    // const expectedTokens = safelist.reduce((acc: { [index: string]: string }, val) => {
    //   acc[val.token.symbol] = val.token.address
    //   return acc
    // }, {})

    // checksum is a XOR of all the token addresses in the safelist
    const toChecksum = (checksum: bigint, address: string) => checksum ^ BigInt(address)
    const safeListTokens = safelist.map(x => x.token.address)
    let expectedChecksum = Object.values(expectedTokens).reduce(toChecksum, 0n)
    let checksum = safeListTokens.reduce(toChecksum, 0n)
    log(`Checksum pre-fetched ${expectedChecksum.toString(16)}, api.thegraph.com ${checksum.toString(16)} [${expectedChecksum === checksum ? "match" : "MISMATCH"}]`)
    if (expectedChecksum !== checksum) {
      throw new Error("Safelist mismatch, something is wrong with either the TheGraph-state or this Vanilla version")
    }

    // now we have all the parameters ready for VanillaRouter and proceed with the deployment
    const { address } = await deploy("VanillaRouter", {
      from: deployer,
      args: [uniswapRouter, RESERVELIMIT_500ETH, safeListTokens],
    })
    log(`VanillaRouter deployed in "${network.name}" at ${address}`)
  } else {
    // public test networks in general have little liquidity in the Uniswap WETH-pairs, so they cannot be used in serious
    // Vanilla testing
    if (network.name === "goerli" && network.config.chainId === 5) {
      const gDAI = "0x9c69cf4e75099bfdcc9e5d97446b1b289881aade"
      const USDT = "0xefb8eeea0148ebd87e0fae3f193c606b93d4ceb4"
      const USDC = "0xd87ba7a50b2e7e660f678a895e4b72e7cb4ccd9c"
      const RESERVELIMIT_10ETH = bn(10n * (10n ** 18n))
      const { address } = await deploy("VanillaRouter", {
        from: deployer,
        args: [uniswapRouter, RESERVELIMIT_10ETH, [gDAI, USDT, USDC]],
      })
      log(`VanillaRouter deployed in "${network.name}" at ${address}`)
    } else if (network.name === "ropsten" && network.config.chainId === 3) {
      const UNI = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"
      const DAI = "0xad6d458402f60fd3bd25163575031acdce07538d"
      const USDC = "0x07865c6e87b9f70255377e024ace6630c1eaa37f"
      const USDT = "0x516de3a7a567d81737e3a46ec4ff9cfd1fcb0136"
      const WBTC = "0x0dcbb23af137dbd11eb959bab128e1d6d7c4371f"
      const RESERVELIMIT_10ETH = bn(10n * (10n ** 18n))
      const { address } = await deploy("VanillaRouter", {
        from: deployer,
        args: [uniswapRouter, RESERVELIMIT_10ETH, [UNI, DAI, USDC, USDT, WBTC]],
        log: true,
      })
      log(`VanillaRouter deployed in "${network.name}" at ${address}`)
    } else if (network.name === "localhost" || network.name === "hardhat") {
      // local setup so just pick first 2 tokens to safelist
      let { address: tokenA } = await get("AAA")
      let { address: tokenB } = await get("BBB")
      const RESERVELIMIT_10ETH = bn(10n * (10n ** 18n))
      const { address } = await deploy("VanillaRouter", {
        from: deployer,
        args: [uniswapRouter, RESERVELIMIT_10ETH, [tokenA, tokenB]],
        log: true,
      })
      log(`VanillaRouter deployed in "${network.name}" at ${address}`)
    }
  }
}
func.dependencies = ["UniswapV2Router02"]
export default func
