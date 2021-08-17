// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.4;

import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

// just to implement the callback for adding/removing liquidity in tests
contract UniswapV3TestHelper is IUniswapV3MintCallback {
    function mint(
        address pool,
        address recipient,
        int24 low,
        int24 high,
        uint128 liquidity
    ) external {
        try IUniswapV3Pool(pool).mint(recipient, low, high, liquidity, abi.encode(pool, msg.sender)) {} catch Error(
            string memory reason
        ) {
            console.log("failed to mint", reason);
            revert(reason);
        }
    }

    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external override {

        (address targetPool, address source) = abi.decode(data, (address, address));
        require( targetPool == msg.sender, "invalid caller" );

        if (amount0Owed > 0) {
            IERC20 token0 = IERC20(IUniswapV3Pool(targetPool).token0());
            token0.transferFrom(source, targetPool, amount0Owed);
        }

        if (amount1Owed > 0) {
            IERC20 token1 = IERC20(IUniswapV3Pool(targetPool).token1());
            token1.transferFrom(source, targetPool, amount1Owed);
        }
    }
}
