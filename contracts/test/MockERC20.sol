// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// This ERC20 is _only_ for easier deploying of mock ERC-20's in tests.
contract MockERC20 is ERC20 {
    uint8 private immutable dec;

    constructor (string memory name_, string memory symbol_, uint8 decimals_, uint256 supply_) ERC20(name_, symbol_) {
        dec = decimals_;
        _mint(msg.sender, supply_);
    }

    function decimals() public view override returns (uint8) {
        return dec;
    }

}
