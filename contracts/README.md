# Vanilla v1 Contract Documentation

Vanilla is implemented in three Solidity contracts. All user-facing calls will happen via [VanillaRouter](VanillaRouter.sol), which inherits trading functionality from [UniswapTrader](UniswapTrader.sol). Profitable trading is rewarded with [VanillaGovernanceToken](VanillaGovernanceToken.sol) -ERC20s.

## Concepts

### Trading

In Vanilla, a user can do two things — buy and sell ERC-20 tokens. All trading happens using [Uniswap](https://github.com/Uniswap/uniswap-v2-core/) [WETH](https://etherscan.io/address/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2) -pairs.

- To buy a token, user calls `VanillaRouter.buy()`-function, along with the address of the traded token, the limit amount of tokens, and a deadline timestamp. VanillaRouter holds the direct ownership of the tokens and keeps record of the assets of each user (see [Token Custody](#token-custody)).
- To sell a token, user calls `VanillaRouter.sell()`-function, along with the address of the traded token, number of sold tokens, the limit amount of Ether, and a deadline timestamp. Users can only sell the tokens, which they have bought themselves.

Trading transaction can revert for multiple reasons, for example:

- Uniswap doesn't recognize the token
- Uniswap can not buy or sell the token for the given price (the constant-product invariant is violated)
- A transaction may take too long to execute (e.g., miners holding back for extended periods, see [Uniswap documentation](https://uniswap.org/docs/v1/frontend-integration/trade-tokens/#deadlines))
- Selling more tokens than possible

### Token custody

Bought tokens are not transferred back to the caller of the `VanillaRouter.buy()`. The VanillaRouter keeps them instead until user sells them with `VanillaRouter.sell()`.

### Price calculations

To calculate the profit of the trade, the contract needs to keep track of the purchase price. The traditional inventory pricing conventions like [FIFO and LIFO](https://en.wikipedia.org/wiki/FIFO_and_LIFO_accounting) are impractical to implement due to the gas costs of keeping track of all purchases.

Instead, Vanilla keeps track of a user-specific average purchase price for each traded token. For this, Vanilla calculates a _Weighted Average Exchange Rate of purchases_ which needs two `uint256`s, the volume of the Ether trade and the volume of the token trade.

#### Weighted Average Exchange Rate of Purchases

Buying a token updates the average purchase price as the ratio of exchange volumes changes:

- User buys 10 tokens for 10 WETH: `ethSum` = 0+10 = 10, `tokenSum` = 0+10 = 10, and average purchase price is `10/10 = 1`
- User buys 10 more tokens for 8 WETH: `ethSum` = 10+8 = 18, `tokenSum` = 10+10 = 20, and average purchase price is `18/20 = 0,9` (fractions are just for the sake of the example, token balances are usually larger than in this example, which mitigates the fixed point rounding errors)

Selling a token adjusts the exchange volumes proportionally, which doesn't update the average purchase price (but shifts the weights for future calculations):

- User sells 15 tokens for 20 WETH: `tokenSum` = 20-15 = 5, but `ethSum` = `ethSum*(tokenSumDiff)/(prevTokenSum)` = 18\*(20-15)/20 = 4.5, and the average purchase price is 4.5/5 = 0.9
- User sells the remaining 5 tokens for 10 WETH: `tokenSum` = 5-5 = 0, `ethSum` = 4.5\*0/5 = 0, and as all is sold, average purchase price is not a number.

Using this formula, Vanilla can keep track of average prices in a gas-efficient and fair way. `VanillaRouter` implements the price calculation logic in internal functions `_executeBuy` and `_executeSell` and keeps track of the exchange volumes in a `_tokenPriceData` mapping.

### Profit

Profit is calculated whenever user sells tokens. Knowing the selling price and the average purchasing price (`ethSum/tokenSum`), the profit is calculated as `receivedEth - expectedEth` where `expectedEth = ethSum*tokensSold/tokenSum`. Basically, if the user received more Ether than was expected, a profit was made.

### Safelist

Vanilla uses a _safelist_ of tokens to filter which profitable trades are eligible for VNL rewards. This is a safety measure to protect the value of `VanillaGovernanceToken` as a malicious ERC-20 can potentially be used to fully control the Uniswap trading and therefore the VNL distribution. The safelisting mechanism only affects the rewards - the non-safelisted tokens can be purchased and sold with Vanilla API, along with profit calculation support.

The safelist is defined as a constructor parameter for `VanillaRouter`. Internally, the safelist checks are implemented with `UniswapRouter.wethReserves` mapping - the internal WETH reserve state is tracked only for safelisted tokens, otherwise it's always 0.

### Tokens

User is rewarded with a number of `VanillaGovernanceToken`s using a formula `R = PVH` where :

- `P` is the absolute [profit](#profit), which sets the theoretical maximum reward for any single trade.
- `V` is the _Value Protection Coefficient_, a percentage which adjusts the reward, incentivizing the trades of tokens where price manipulation is more expensive and therefore the value of the governance token is best protected.
- `H` is the _Holding/Trading Ratio Squared_, a percentage which adjusts the reward, incentivizing longer holding periods and earlier purchases.

`VanillaRouter` implements the reward algorithm in an internal function `_calculateReward` and mints the tokens based on reward in the `_executeSell`-function.

The `VanillaGovernanceToken` uses 12 decimals for displaying VNL amounts in a more human-readable range. This means that for a 1ETH of profit the theoretical maximum reward is 1000000VNL.

### Value Protection Coefficient

With constant product markets like Uniswap, the price manipulation of a single token is always possible, however it has [a cost relative to the liquidity pool size](https://arxiv.org/abs/1911.03380). Based on this dynamic, the _Value Protection Coefficient_ is used to protect the reward mechanism and the value of the governance tokens against price manipulation and malicious tokens.

The coefficient formula is `V = 1-min((P + L)/W, 1)` where

- `P` is the absolute [profit](#profit) in Ether.
- `L` is the immutable WETH reserve limit that is set when the VanillaRouter is deployed. This means that rewards are never minted when selling a token whose WETH liquidity reserves are lower than `L`.
- `W` is the internally tracked WETH reserve size for the Uniswap liquidity pair. This means that trades of high-liquidity tokens will get a higher coefficient and the reward than low-liquidity tokens.

To further protect the token value against the more sophisticated market manipulation, the internally tracked `W` is updated using Uniswap WETH reserves and contract state with following rules:

- `W = max(W, uniswapReserve)` when buying the token,
- `W = min(W, uniswapReserve)` when selling the token

UniswapTrader implements the internal WETH reserve update rules in private `_updateReservesOnBuy` and `_updateReservesOnSell` functions.

### Holding/Trading Ratio, Squared

The _Holding/Trading Ratio, Squared_ is used to protect the value of the governance token against short-term speculations, and to incentivize longer holding periods and earlier investment.

The HTRS formula is `H = (Bhold/Btrade)² = ((Bmax-Bavg)/(Bmax-Bmin))²` where

- `Bhold` is the number of blocks the trade has been held (instead of traded)
- `Btrade` is the maximum possible trading time in blocks
- `Bmax` is `block.number` (when the trade is happening)
- `Bavg` is the [Volume-Weighted Average of the Purchase](#weighted-average-block-of-purchase)
- `Bmin` is the [epoch](#vanillarouterepoch) - the `block.number` when VanillaRouter was deployed

#### Weighted Average Block of Purchase

Similarly to Average Price of Purchase, Vanilla keeps track of Average Block of Purchase for each user and each token they traded. The algorithm is adapted from [VWAP](https://en.wikipedia.org/wiki/Volume-weighted_average_price) but the algorithm weighs the `block.number` in which the purchase happens instead of price. For example:

- User buys 10 tokens in block 100: `tokenSum` = 10, `weightedBlockSum` = 0 + (10\*100) = 1000, average block = 1000/10 = 100
- User buys 20 tokens in block 200: `tokenSum` = 30, `weightedBlockSum` = 1000 + (20\*200) = 5000, average block = 5000/30 = 166

All block numbers in calculations are defined as a distance from the _epoch_ which is the block.number in which the `VanillaRouter` was deployed.

Similarly to Average Price of Purchase, when selling tokens the algorithm adjusts the `weightedBlockSum` proportionally which only updates the weights but not the average block of purchases.

`VanillaRouter` implements the block averaging logic in internal functions `_executeBuy` and `_executeSell` and keeps track of the weighted sums in a `_tokenPriceData` mapping.

## API

### State-changing functions

#### VanillaRouter.buy()

The tokens are bought using this function. The signature is as follows:

| name     | Description                                                                                                                                                                                       | Preconditions                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| token    | A ERC-20 token address to buy for `numEth`.                                                                                                                                                       | An UniswapV2Pair for trading WETH and token must exist.                                                   |
| numEth   | The amount of WETH to spend to buy `numToken` tokens.                                                                                                                                             | VanillaRouter must have sufficient allowance to transfer `numEth` WETH from the trader.                   |
| numToken | The minimum amount of tokens to make trade acceptable (i.e. [limit amount](#off-chain-prices-and-limits)). The calculated purchase price is therefore equal to exchange rate `numEth / numToken`. | [Uniswap liquidity invariants and preconditions](https://uniswap.org/docs/v2/core-concepts/swaps/) apply. |
| deadline | The trade execution deadline as `block.timestamp`, to protect the trader from transaction reordering delays.                                                                                      | `deadline` must be later than the time of trade, otherwise the transaction reverts.                       |

If the trade was successful, the [`TokensPurchased` event](#events) is emitted.

This function is more gas-efficient way of buying if the trader already owns the WETH tokens to make a trade.

#### VanillaRouter.depositAndBuy() payable

This function behaves similarly to [buy()](#vanillarouterbuy), but is payable and doesn't require `numEth` parameter nor its preconditions for WETH pre-approval. Instead, it internally wraps the `msg.value` amount of ether to WETH before continuing with the trading.

`depositAndBuy()` is an easier way of buying if the trader don't possess WETH tokens beforehand.

#### VanillaRouter.sell()

The tokens are sold using this function. The signature is as follows:

| name        | Description                                                                                                                                                                                      | Preconditions                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| token       | A ERC-20 token address to sell for `numEthLimit`.                                                                                                                                                | `msg.sender` must own this token in the [Vanilla custody](#token-custody).                                |
| numToken    | The amount of tokens to swap to `numEthLimit` WETH.                                                                                                                                              | `msg.sender` must own enough tokens in custody.                                                           |
| numEthLimit | The minimum amount of WETH to make trade acceptable (i.e. [limit amount](#off-chain-prices-and-limits)). The calculated sell price is therefore equal to exchange rate `numEthLimit / numToken`. | [Uniswap liquidity invariants and preconditions](https://uniswap.org/docs/v2/core-concepts/swaps/) apply. |
| deadline    | The trade execution deadline as `block.timestamp`, to protect the trader from transaction reordering delays.                                                                                     | `deadline` must be later than the time of trade, otherwise the transaction reverts.                       |

If the trade was successful, the [`TokensSold` event](#events) is emitted.

This function is more gas-efficient way of selling if the trader has a need for the received WETH tokens instead of unwrapped Ether.

#### VanillaRouter.sellAndWithdraw()

This function behaves similarly to [sell()](#vanillaroutersell) with equal function signature, but instead of transferring the WETHs back to `msg.sender` as-is, it withdraws the Ether from the WETH tokens and sends them to `msg.sender` receive/fallback function (with empty calldata).

`VanillaRouter.sellAndWithdraw()` is the easier way of selling tokens if the trader just needs the unwrapped Ether.

### Read-only functions

#### VanillaRouter.epoch()

Getter for `VanillaRouter.epoch`. Returns the `block.number` when the VanillaRouter was deployed.

#### VanillaRouter.vnlContract()

Getter for `VanillaRouter.vnlContract`. Returns the address of the VanillaGovernanceToken that VanillaRouter owns.

#### UniswapRouter.wethReserves(address token)

Getter function for `UniswapRouter.wethReserves[token]`. Returns either:

- 0 for non-safelisted token
- [`VanillaRouter.reserveLimit()`](#vanillarouterreservelimit) for safelisted but untraded token, or
- the internally tracked WETH reserve value for safelisted and traded token

#### UniswapRouter.isTokenRewarded(address token)

Returns true if token was included in the [safelist](#safelist).

#### VanillaRouter.tokenPriceData(address owner, address token)

Getter function for `tokenPriceData[owner][token]`. Returns the unwrapped `PriceData` struct.

#### VanillaRouter.reserveLimit()

Getter for `reserveLimit`. Returns the WETH reserve limit used in [value protection algorithm](#value-protection-coefficient).

## Safety considerations

### Upgrades and contract ownership

Vanilla contracts are _not_ upgradeable on purpose. This is more gas-efficient and safer for users. There is no privileged access of any kind. Future feature upgrades will be done using a migration mechanism.

### Math

Vanilla contracts use OpenZeppelin's [SafeMath.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/math/SafeMath.sol) for safer uint-calculations.

### Off-chain prices and limits

Because the token amount- and limit- arguments in `VanillaRouter.buy` and `VanillaRouter.sell` are used as-is to make the swap, contract users **must** calculate all the amounts based on good off-chain price oracles. Failing to do so could lead to an unrecoverable loss of tokens. For example, if you call `VanillaRouter.sell` to sell all your tokens, but set `numEth` parameter accidentally too low, a front-runner can collect the price arbitrage for the user's loss.

The limits in `buy` and `sell` work similarly as in Uniswap so read their [safety considerations](https://uniswap.org/docs/v2/smart-contract-integration/trading-from-a-smart-contract/#safety-considerations) before calling the VanillaRouter.

Similarly, as noted in Uniswap v2 [audit report](https://uniswap.org/audit.html#orgbaba79b), using limits does not entirely protect users from front-runners and price manipulation, as setting limits too tightly increases the risk of a reverted swap.

## Events

VanillaRouter emits the following events after successful trading operations:

1. `event TokensPurchased(address indexed buyer, address indexed token, uint256 eth, uint256 amount)`

   - `buyer` is the new owner of tokens (the caller of the `buy`-function)
   - `token` is the contract address of the token
   - `eth` is the amount of Ether for purchasing `amount` tokens

2. `event TokensSold(address indexed seller, address indexed token, uint256 amount, uint256 eth, uint256 profit, uint256 reward)`
   - `seller` is the owner of tokens (the caller of the `sell`-function)
   - `token` is the contract address of the token
   - `amount` tokens were sold for `eth` amount of Ether, which was transferred to `seller`
   - the `profit` is the [calculated profit](#profit) in Ether, and `reward` is the [calculated amount of VNL reward](#tokens) which was minted to the `seller`
