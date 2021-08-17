// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.4;

import "../interfaces/IVanillaV1MigrationTarget02.sol";

contract MockVanillaV1MigrationTarget02 is IVanillaV1MigrationTarget02 {

    event MigrationParams(address owner, address token, uint256 ethSum, uint256 tokenSum, uint256 weightedBlockSum, uint256 latestBlock);

    function migrateState(address owner, address token, uint256 ethSum, uint256 tokenSum, uint256 weightedBlockSum, uint256 latestBlock) override external {
        emit MigrationParams(owner, token, ethSum, tokenSum, weightedBlockSum, latestBlock);
    }
}
