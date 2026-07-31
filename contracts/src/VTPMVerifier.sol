// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title IVTPMVerifier
/// @notice Verifies a vTPM-style attestation quote proving that the Whisper
///         matching engine ran inside attested hardware. This is a thin,
///         hackathon-friendly wrapper that follows the structure of
///         `flare-foundation/flare-vtpm-attestation` but with a simplified
///         verification path so we can demo on Coston2 without a live TEE.
///
/// In production, the on-chain verification would:
///  1) Parse the GCP Confidential Space OIDC token
///  2) Verify the JWT signature against the GCP workload identity pool
///  3) Verify the embedded vTPM quote PCR values match the registered measurement
///  4) Verify the image hash matches the expected container image
///
/// For the hackathon we expose `verifyMockAttestation` that allows the deployer
/// to pre-register a TEE identity, and `isTEEAttested` that checks the quote
/// was signed by that registered identity. We document the production
/// upgrade path in docs/SECURITY.md.
contract WhisperVTPMVerifier is Ownable {
    /// @notice Registered TEE identity => active
    mapping(bytes32 => bool) public registeredTEEs;

    /// @notice TEE public keys (used to verify quote signatures)
    mapping(bytes32 => address) public teePublicKey;

    /// @notice Expected image measurement (sha256 hash of the attested container)
    bytes32 public expectedMeasurement;

    event TEERegistered(bytes32 indexed teeId, address publicKey, bytes32 measurement);
    event TEERevoked(bytes32 indexed teeId);

    error TEEIdZero();
    error AlreadyRegistered();
    error NotRegistered();

    constructor(bytes32 _expectedMeasurement, address _owner) Ownable(_owner) {
        expectedMeasurement = _expectedMeasurement;
    }

    function registerTEE(bytes32 teeId, address publicKey, bytes32 measurement) external onlyOwner {
        if (teeId == bytes32(0)) revert TEEIdZero();
        if (registeredTEEs[teeId]) revert AlreadyRegistered();
        require(measurement == expectedMeasurement, "measurement mismatch");
        registeredTEEs[teeId] = true;
        teePublicKey[teeId] = publicKey;
        emit TEERegistered(teeId, publicKey, measurement);
    }

    function revokeTEE(bytes32 teeId) external onlyOwner {
        if (!registeredTEEs[teeId]) revert NotRegistered();
        registeredTEEs[teeId] = false;
        emit TEERevoked(teeId);
    }

    /// @notice Verify an attestation quote. Format (tight, no padding):
    ///         bytes32 teeId || uint256 nonce || bytes65 signature
    function isTEEAttested(bytes calldata attestation) external view returns (bool) {
        if (attestation.length < 32 + 32 + 65) return false;
        bytes32 teeId;
        uint256 nonce;
        // abi.decode is cleaner but we use calldata slicing to save gas on the check
        assembly {
            teeId := calldataload(attestation.offset)
            nonce := calldataload(add(attestation.offset, 32))
        }
        if (!registeredTEEs[teeId]) return false;
        address pk = teePublicKey[teeId];
        if (pk == address(0)) return false;
        // signature: 65 bytes at offset 64
        bytes calldata sig = attestation[64:64 + 65];
        bytes32 digest = keccak256(abi.encodePacked(teeId, nonce, expectedMeasurement));
        // EIP-191 prefix
        digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        address recovered = _recover(digest, sig);
        return recovered == pk;
    }

    function setExpectedMeasurement(bytes32 m) external onlyOwner {
        expectedMeasurement = m;
    }

    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
