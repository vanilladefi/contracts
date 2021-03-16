// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.6.8;

import "../contracts/VanillaRouter.sol";

// Only used for testing the internal reward function. As Hardhat doesn't currently support additional locations for test-contracts,
// run `npm run compile:sol` to compile the contracts in this file

contract VanillaRouterDelegate is VanillaRouter {
    constructor(address uniswapRouter, address[] memory allowedTokens) public VanillaRouter(uniswapRouter, 1, allowedTokens) {

    }

    function calculateReward(uint256 epoch_,
        uint256 avgBlock,
        uint256 currentBlock,
        uint256 profit,
        uint128 wethReserve,
        uint128 reserveLimit_
    ) external pure returns (uint256) {
        return _calculateReward(epoch_, avgBlock, currentBlock, profit, wethReserve, reserveLimit_);
    }
}
