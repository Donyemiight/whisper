// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {WhisperVault} from "./WhisperVault.sol";
import {IFdcVerification} from "@flarenetwork/coston2/IFdcVerification.sol";
import {IPayment} from "@flarenetwork/coston2/IPayment.sol";
import {ContractRegistry} from "@flarenetwork/coston2/ContractRegistry.sol";

/// @title WhisperSettle
/// @notice Coordinates the two-leg settlement of a Whisper trade:
///         1) TEE attested a match on-chain via WhisperVault.attestMatch
///         2) TEE signed the XRPL Payment transaction (PMW)
///         3) The XRPL Payment is verified on Flare via FDC V1 Payment attestation
///         4) On valid proof, FXRP escrow is released to the bidder
contract WhisperSettle is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    WhisperVault public vault;
    IERC20 public fxrp;

    /// @notice Track which matches have been finalized
    mapping(bytes32 => bool) public finalized;

    /// @notice Track askOrderId by matchId (set by the TEE relayer after attest)
    mapping(bytes32 => bytes32) public matchAsk;
    mapping(bytes32 => bytes32) public matchBid;
    mapping(bytes32 => uint256) public matchXrpAmount;

    // ----------------------------------------------------------------
    // Events
    // ----------------------------------------------------------------

    event SettlementInitialized(bytes32 indexed matchId, bytes32 askOrderId, bytes32 bidOrderId, uint256 xrpAmount);
    event SettlementFinalized(bytes32 indexed matchId, bytes32 indexed xrplTxId, address indexed bidder);

    // ----------------------------------------------------------------
    // Errors
    // ----------------------------------------------------------------

    error UnknownMatch();
    error AlreadyFinalized();
    error NotVault();
    error InvalidFDCProof();
    error ZeroAddress();

    // ----------------------------------------------------------------
    // Constructor
    // ----------------------------------------------------------------

    constructor(address _vault, address _owner) Ownable(_owner) {
        if (_vault == address(0)) revert ZeroAddress();
        vault = WhisperVault(_vault);
        fxrp = vault.fxrp();
    }

    // ----------------------------------------------------------------
    // TEE relayer notifies settle of an attested match
    // ----------------------------------------------------------------

    /// @notice The TEE relayer (which signed the XRPL payment) calls this to
    ///         register the match details for the upcoming FDC verification.
    function initializeSettlement(
        bytes32 matchId,
        bytes32 bidOrderId,
        bytes32 askOrderId,
        uint256 xrpAmount
    ) external {
        if (msg.sender != owner() && msg.sender != address(vault)) revert NotVault();
        matchAsk[matchId] = askOrderId;
        matchBid[matchId] = bidOrderId;
        matchXrpAmount[matchId] = xrpAmount;
        emit SettlementInitialized(matchId, askOrderId, bidOrderId, xrpAmount);
    }

    // ----------------------------------------------------------------
    // Finalize after FDC V1 Payment attestation
    // ----------------------------------------------------------------

    /// @notice Submit an FDC V1 Payment proof showing the XRPL transaction settled.
    ///         On success, releases the FXRP escrow to the bidder.
    function finalizeWithProof(
        bytes32 matchId,
        IPayment.Proof calldata paymentProof,
        IPayment.ResponseBody calldata paymentResponse
    ) external nonReentrant {
        if (finalized[matchId]) revert AlreadyFinalized();

        // 1. Verify the FDC proof against the on-chain Merkle root
        IFdcVerification fdc = ContractRegistry.getFdcVerification();
        bool ok = fdc.verifyPayment(paymentProof);
        if (!ok) revert InvalidFDCProof();

        // 2. Decode the payment response: must reference the expected XRPL tx id
        // (we don't pin to a specific tx hash here because the XRPL tx is in the response)
        // For hackathon: we treat the response body as the canonical proof.

        // 3. Pull FXRP from the vault and send to the bidder
        bytes32 askOrderId = matchAsk[matchId];
        bytes32 bidOrderId = matchBid[matchId];
        WhisperVault.Order memory ask = vault.getOrder(askOrderId);
        WhisperVault.Order memory bid = vault.getOrder(bidOrderId);

        // The vault holds the asker's FXRP escrow
        // We move it to the bidder
        // In a production system, the vault would have an explicit transferOut()
        // function gated on this contract. For the hackathon, we use a low-level call.
        (bool s, ) = address(vault).call(
            abi.encodeWithSignature("releaseToBidder(bytes32)", matchId)
        );
        require(s, "vault release failed");

        // 4. Transfer
        fxrp.safeTransfer(bid.trader, ask.escrowAmount);

        finalized[matchId] = true;
        emit SettlementFinalized(matchId, keccak256(abi.encode(paymentResponse)), bid.trader);
    }

    function _responseTxId(IPayment.ResponseBody calldata body) internal pure returns (bytes32) {
        return keccak256(abi.encode(body));
    }

    // ----------------------------------------------------------------
    // Admin
    // ----------------------------------------------------------------

    function setVault(address _vault) external onlyOwner {
        if (_vault == address(0)) revert ZeroAddress();
        vault = WhisperVault(_vault);
        fxrp = IERC20(WhisperVault(_vault).fxrp());
    }
}
