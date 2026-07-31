// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WhisperVault} from "../src/WhisperVault.sol";
import {WhisperSettle} from "../src/WhisperSettle.sol";
import {WhisperVTPMVerifier} from "../src/VTPMVerifier.sol";
import {MockFXRP} from "../src/MockFXRP.sol";

contract WhisperVaultTest is Test {
    WhisperVault vault;
    WhisperSettle settle;
    WhisperVTPMVerifier tee;
    MockFXRP fxrp;

    address alice = address(0x1111111111111111111111111111111111111111);
    address bob = address(0x2222222222222222222222222222222222222222);
    uint256 teePrivKey = 0xA11CE;  // arbitrary fixed private key for testing
    address teeKey;  // derived in setUp from teePrivKey
    address attacker = address(0x4444444444444444444444444444444444444444);

    bytes32 teeMeasurement = keccak256("whisper-tee-image-v1");
    bytes32 aliceTEEId = keccak256("alice-tee");

    function setUp() public {
        teeKey = vm.addr(teePrivKey);
        fxrp = new MockFXRP(address(this));
        tee = new WhisperVTPMVerifier(teeMeasurement, address(this));
        vault = new WhisperVault(address(fxrp), address(0x9999), address(tee), teeMeasurement, address(this));
        settle = new WhisperSettle(address(vault), address(this));
        vault.setSettle(address(settle));
        tee.registerTEE(aliceTEEId, teeKey, teeMeasurement);

        // Fund alice and bob
        fxrp.mint(alice, 100_000 * 1e6);
        fxrp.mint(bob, 100_000 * 1e6);

        // Approve vault from alice
        vm.prank(alice);
        fxrp.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        fxrp.approve(address(vault), type(uint256).max);
    }

    function _signAttestation(bytes32 teeId, uint256 nonce) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked(teeId, nonce, teeMeasurement));
        // The verifier applies EIP-191 prefix before ecrecover.
        // vm.sign expects the same prefixed digest.
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teePrivKey, ethDigest);
        // Tight encoding: teeId || nonce || sig (no abi.encode padding)
        return abi.encodePacked(teeId, nonce, r, s, v);
    }

    function test_SubmitBid() public {
        vm.prank(alice);
        bytes32 orderId = vault.submitOrder(
            WhisperVault.Side.BID,
            keccak256("encrypted-bid-payload"),
            0,
            1000 * 1e6,
            2_500_000,
            block.timestamp + 1 hours
        );
        WhisperVault.Order memory o = vault.getOrder(orderId);
        assertEq(o.trader, alice);
        assertTrue(o.active);
        assertFalse(o.matched);
    }

    function test_SubmitAskLocksEscrow() public {
        vm.prank(alice);
        bytes32 orderId = vault.submitOrder(
            WhisperVault.Side.ASK,
            keccak256("encrypted-ask-payload"),
            50_000 * 1e6,
            1000 * 1e6,
            2_500_000,
            block.timestamp + 1 hours
        );
        assertEq(fxrp.balanceOf(address(vault)), 50_000 * 1e6);
    }

    function test_CancelAskRefunds() public {
        vm.startPrank(alice);
        bytes32 orderId = vault.submitOrder(
            WhisperVault.Side.ASK,
            keccak256("encrypted-ask-payload"),
            50_000 * 1e6,
            1000 * 1e6,
            2_500_000,
            block.timestamp + 1 hours
        );
        vault.cancelOrder(orderId);
        vm.stopPrank();
        assertEq(fxrp.balanceOf(alice), 100_000 * 1e6);
    }

    function test_AttestMatchConsumesEscrow() public {
        vm.startPrank(alice);
        bytes32 bidId = vault.submitOrder(
            WhisperVault.Side.BID, keccak256("bid"), 0, 1000 * 1e6, 2_500_000, block.timestamp + 1 hours
        );
        bytes32 askId = vault.submitOrder(
            WhisperVault.Side.ASK, keccak256("ask"), 50_000 * 1e6, 1000 * 1e6, 2_500_000, block.timestamp + 1 hours
        );
        vm.stopPrank();

        bytes memory att = _signAttestation(aliceTEEId, 1);
        bytes32 matchId = keccak256("match-1");
        vault.attestMatch(matchId, bidId, askId, 1000 * 1e6, 2_500_000, att);

        WhisperVault.Order memory b = vault.getOrder(bidId);
        WhisperVault.Order memory a = vault.getOrder(askId);
        assertTrue(b.matched);
        assertTrue(a.matched);
    }

    function test_AttestMatchRejectsUnregisteredTEE() public {
        vm.startPrank(alice);
        bytes32 bidId = vault.submitOrder(
            WhisperVault.Side.BID, keccak256("bid"), 0, 1000 * 1e6, 2_500_000, block.timestamp + 1 hours
        );
        bytes32 askId = vault.submitOrder(
            WhisperVault.Side.ASK, keccak256("ask"), 50_000 * 1e6, 1000 * 1e6, 2_500_000, block.timestamp + 1 hours
        );
        vm.stopPrank();

        // Sign with attacker's key (not the registered TEE key)
        bytes32 digest = keccak256(abi.encodePacked(aliceTEEId, uint256(2), teeMeasurement));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(uint160(attacker)), ethDigest);
        bytes memory att = abi.encode(aliceTEEId, uint256(2), abi.encodePacked(r, s, v));

        vm.expectRevert(WhisperVault.NotTEEAttested.selector);
        vault.attestMatch(keccak256("m"), bidId, askId, 1000 * 1e6, 2_500_000, att);
    }

    function test_ReplayAttackFails() public {
        vm.startPrank(alice);
        bytes32 bidId = vault.submitOrder(
            WhisperVault.Side.BID, keccak256("bid"), 0, 1000 * 1e6, 2_500_000, block.timestamp + 1 hours
        );
        bytes32 askId = vault.submitOrder(
            WhisperVault.Side.ASK, keccak256("ask"), 50_000 * 1e6, 1000 * 1e6, 2_500_000, block.timestamp + 1 hours
        );
        vm.stopPrank();

        bytes memory att = _signAttestation(aliceTEEId, 3);
        vault.attestMatch(keccak256("m1"), bidId, askId, 1000 * 1e6, 2_500_000, att);
        vm.expectRevert(WhisperVault.AlreadyMatched.selector);
        vault.attestMatch(keccak256("m2"), bidId, askId, 1000 * 1e6, 2_500_000, att);
    }
}
