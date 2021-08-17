# Vanilla v1.1 Contract Documentation

## Overview

Vanilla v1.1 is a permissionless, non-upgradeable trading system deployed in Ethereum mainnet. In Vanilla, there are three user roles who can change the system state - the traders, VNL holders, and the Vanilla DAO.

Vanilla traders can:
- open personal ERC-20 token positions with Ether/WETH ([buy](#buy)),
- close those positions for Ether/WETH ([sell](#sell)),
- withdraw their token positions from the custody without selling ([emergency withdraw](#emergency-withdraw)), and
- migrate their token positions to approved future versions ([migrate position](#migrate-position))

VNL holders can:
- convert their v1.0 VNL tokens to v1.1 VNL tokens ([convert](#convert-vnl)),
- do any standard ERC-20 operations with their tokens ([transfer, approve, etc](#standard-erc-20-operations))

Vanilla DAO can:
- add ERC-20s to the _safelist_ which enables the Vanilla profit-mining for them ([update safelist](#update-safelist))
- remove ERC-20s from the _safelist_ which disables the Vanilla profit-mining for them ([update safelist](#update-safelist)
- update the v1.0 token snapshot which enables VNL holders to convert their tokens ([update migrationstate](#update-migration-state))
- approve the next future version which enables traders to migrate their positions ([approve next version](#approve-next-version))

These are the **only** state-changing operations that anyone can execute in Vanilla. This means for example:

- Nobody can mint new VNL except the smart contracts
- Nobody can close traders' positions except the trader who owns it
- Nobody can stop contracts from working or upgrade the functionality


## Trader operations

These operations are located in the `VanillaV1Router02` contract.

### General concepts

#### Multi-call support

Vanilla implements the so-called _multicall_ support for any state-changing operations that traders can perform. This is an adapted version from the [OpenZeppelin implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Multicall.sol) which works with `payable`.

The `executePayable` multicall function in Vanilla works like this:
1. if function was called with non-zero value, Vanilla deposits it all to WETH (only single deposit per multicall, which saves gas)
2. Vanilla executes all encoded function arguments using `delegateCall` on itself (how WETHs are allocated on each encoded buy/sell is controlled by the [OrderData-struct](#orderdata))
3. After successful `delegateCall`s, Vanilla first withdraws all WETH back to Ether, and finally sends all Ether the contract owns back to caller (only single withdraw per multicall, which saves gas)

This enables trader to use Ether for trading (Vanilla and Uniswap v3 uses WETH internally so `executePayable` is the only entrypoint where WETH deposit is made), and combine different trader functions in a single transaction.

`execute` multicall function is similar to `executePayable` except that it's not payable and therefore cannot be used on buying directly with Ether.

#### OrderData

The `OrderData` struct is used as an input for both buy and sell-transactions.

```solidity
struct OrderData {
    // The address of the token to be bought or sold
    address token;

    // if true, buy-order transfers WETH from caller and sell-order transfers WETHs back to caller without withdrawing
    // if false, it's assumed that executePayable is used to deposit/withdraw WETHs before order
    bool useWETH;

    // The exact amount of WETH to be spent when buying or the limit amount of WETH to be received when selling.
    uint256 numEth;

    // The exact amount of token to be sold when selling or the limit amount of token to be received when buying.
    uint256 numToken;

    // The block.timestamp when this order expires
    uint256 blockTimeDeadline;

    // The Uniswap v3 fee tier to use for the swap (500 = 0.05%, 3000 = 0.3%, 10000 = 1.0%)
    uint24 fee;
}
```

### Buy

```solidity
function buy( OrderData calldata buyOrder ) payable external;
```
This function uses `OrderData` input as a buy-order, with following properties after successful execution:

- `numEth` WETHs has been transferred to existing and initialized Uniswap v3 pool with `fee` from either Vanilla custody balance (when `useWETH` is false) or directly from trader's balance (when `useWETH` is false)
- at least `numToken` more `token`s will be in Vanilla custody, added into `msg.sender` `token`-position
- `block.timestamp` of the transaction will be less than `blockTimeDeadline`

It can be called by a trader:
- who either
  - has atleast `numEth` WETH in current balance _and_ has approved VanillaV1Router02 to spend `numEth` WETH (if `useWETH` is true), or
  - is executing `buy` within the `executePayable` function batch _and_ has sent atleast `numEth` of value (if `useWETH` is false)
- who has not executed a transaction for the `token` in the same block (one-trade-per-block-per-token rule)


### Sell

```solidity
function sell( OrderData calldata sellOrder ) payable external;
```
This function uses `OrderData` input as a sell-order, with following properties after successful execution:

- `numToken` `token`s has been transferred to existing and initialized Uniswap v3 pool with `fee` from Vanilla custody's balance
- either at least `numEth` more WETH will be added (temporarily) into Vanilla custody (if `useWETH` is false), or at least `numEth` WETHs will be transferred directly to `msg.sender` (if `useWETH` is true)
- `block.timestamp` of the transaction will be less than `blockTimeDeadline`
- the positive difference of [profit-mining price]() and the [expected price](#expected-price) will be used in profit-mining calculation, and VNL tokens will be minted to `msg.sender` accordingly

It can be called by a trader:
- who has an existing position in `token`, sized at least `numToken` tokens
- who has not executed a transaction for the `token` in the same block (one-trade-per-block-per-token rule)


### Emergency Withdraw

```solidity
function withdrawTokens(address token) external;
```

This function:
- will transfer to trader (`msg.sender`) the exact amount of `token` which matches the trader's current position
- will clear the trader position data for given token

It can be called by any trader who has an open position in Vanilla and is only intended to be used when there are emerging issues with either Uniswap v3 pools or Vanilla contracts.

### Migrate Position

```solidity
function migratePosition(address token, address nextVersion) external;
```

This function:
- will transfer to [approved](#approve-next-version) `nextVersion` the exact amount of `token` which matches the trader's current position.
- will call the function `IVanillaV1MigrationTarget02.migrateState()` -function with trader's current position data
- will clear the trader `token` position data

It can be called by any trader who has an open position in Vanilla but will revert until Vanilla DAO [approves the next version](#approve-next-version).

## VNL Holder operations

These operations are located in `VanillaV1Token02` contract.

### Convert VNL

```solidity
function convertVNL(bytes32[] memory proof) external;
```
This function:
- will check that the Merkle tree leaf `keccak256(abi.encodePacked(msg.sender, ":", IERC20(address(vanillaV1_01)).balanceOf(msg.sender)))` along with the `proof` matches the migration state Merkle tree root in `VanillaV1MigrationState.stateRoot()`
- will transfer all `msg.sender`s VNL v1.0 tokens to `VanillaV1Token02` balance (effectively locked there)
- will mint `msg.sender` VNL v1.1 tokens in return in 1:1 ratio

It can be called by anyone who has an existing balance of VNL v1.0 tokens, has approved the `VanillaV1Token02` to spend those tokens, and whose token balance has been included in the latest [migration state snapshot](#update-migration-state)

### Standard ERC-20 operations

`VanillaV1Token02` contract extends [OpenZeppelin's ERC-20 reference implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol). VNL token has 12 decimals.

## Vanilla DAO operations

These operations are located in `VanillaV1MigrationState` and `VanillaV1Safelist01` contracts.

### Update Safelist

```solidity
function modify(address[] calldata added, address[] calldata removed) external onlyOwner
```

This function is located in `VanillaV1Safelist01` contract and:
- will add the `added` tokens to public `isSafelisted` mapping
- will remove the `removed` tokens from public `isSafelisted` mapping

It can only be called by the Vanilla DAO multisig.

### Update Migration State

```solidity
function updateConvertibleState(bytes32 newStateRoot, uint64 blockNum) onlyOwner beforeDeadline external
```
This function is located in `VanillaV1MigrationState` contract and:
- will set the `newStateRoot` (the Merkle tree state root of all VNL v1 balances before the block number `blockNum`) to public `stateRoot` variable
- will reset the public `conversionDeadline` timestamp to roughly 30 days from the transaction `block.timestamp` (30 * 24 * 60 * 60 seconds)

It can only be called by the Vanilla DAO multisig, and is callable only if `block.timestamp` is less than `conversionDeadline`

### Approve Next Version

```solidity
function approveNextVersion(address implementation) external onlyOwner
```

This function is located in  `VanillaV1Safelist01` contract and:
- will set the public `nextVersion` variable to `implementation`

It can only be called by the Vanilla DAO multisig.

## Profit mining

Profit mining state and logic is located in `VanillaV1Router02` contract.

### Internal state

```solidity
/// @dev data for calculating volume-weighted average prices, average purchasing block, and limiting trades per block
struct PriceData {
  uint256 weightedBlockSum; // for calculating Average purchasing block
  uint112 ethSum; // for calculating volume-weighted average price
  uint112 tokenSum; // for calculating averages and keeping track of position size
  uint32 latestBlock; // verify the one-trade-per-block-per-token rule and protect against reentrancy
}
/// @notice Price data, indexed as [owner][token]
mapping(address => mapping(address => PriceData)) public override tokenPriceData;
```

### Expected price

The expected price (i.e. the amount of Eth should closing the position generate to break-even) for a `trader`, when selling `numToken` of `token`s is calculated as:

```solidity
PriceData position = tokenPriceData[trader][token];
uint profitablePrice = numToken * position.ethSum / position.tokenSum;
```

### Profit-mining price

The price used in actual profit-mining formula is computed based on the Uniswap pool state and v3 price history length. Before closing/reducing the position, `VanillaV1Uniswap02` queries the pool for following information:

- The oldest observation in the pool (which contains `blockTimestamp`)
- The observation `period` which equals `Math.min(block.timestamp - oldestObservation.blockTimestamp, MAX_TWAP_PERIOD)` where `MAX_TWAP_PERIOD` is 300 seconds (or 5 minutes)
- The time-weighted average ETH price - `expectedAvgEth` - from the target Uniswap pool for a period of `[0, period]`


Using the `period`, `expectedAvgEth`, the actual number of ETH received from the pool when selling the tokens (`numEth`), and the [expected price](#expected-price),  the profit-mining price is calculated as:

```solidity
uint profitMiningPrice = Math.min(
    numEth,
    (expectedPrice * (MAX_TWAP_PERIOD - period) + expectedAvgEth * period) /
        MAX_TWAP_PERIOD
)
```

This means that:

- Selling tokens in an Uniswap pool where `observationCardinality() == 1` will always result in `period == 0` and `profitMiningPrice == expectedPrice`, which effectively results in zero reward
- Longer price observation history means smoother and harder-to-manipulate time-weighted average prices, so the algorithm can give larger weight to the TWAP price

### Profit-mining algorithm

See [FAQ](https://vanilladefi.com/faq#how-are-profit-mining-rewards-calculated-for-trading).
