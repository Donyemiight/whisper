// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockFXRP
/// @notice A testnet-only mock of FXRP for the Coston2 demo. On mainnet, FXRP
///         is the canonical FAsset minted by the FAssets system.
contract MockFXRP is ERC20 {
    constructor(address minter) ERC20("Mock FXRP", "mFXRP") {
        _mint(minter, 1_000_000 * 1e6); // 1M mFXRP, 6 decimals like real FXRP
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
