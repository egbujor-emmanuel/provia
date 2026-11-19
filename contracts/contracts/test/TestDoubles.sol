// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test double for zkVerify's aggregation verifier: attests exactly the leaves a test registers,
/// so tests can prove ProviaEscrow rebuilds the right leaf and rejects every other one.
contract AttestingVerifier {
    mapping(bytes32 => bool) public attested;

    function attest(bytes32 leaf) external {
        attested[leaf] = true;
    }

    function verifyProofAggregation(uint256, uint256, bytes32 leaf, bytes32[] calldata, uint256, uint256)
        external
        view
        returns (bool)
    {
        return attested[leaf];
    }
}

/// @dev 6-decimal test token standing in for USDC in local tests only.
contract TestUSDC is ERC20 {
    constructor() ERC20("Test USDC", "tUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
