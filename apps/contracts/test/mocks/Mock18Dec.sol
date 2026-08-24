// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 18-decimal stablecoin to exercise per-token decimal scaling. Nothing on
/// Base is 18-decimal, but the contract accepts any ERC-20 and reads decimals()
/// on-chain, so the mixed-magnitude path must stay covered.
contract Mock18Dec is ERC20 {
    constructor() ERC20("Mock 18-Decimal Dollar", "MOCK18") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
