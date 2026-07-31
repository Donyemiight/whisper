"""Data models for the Whisper dark pool."""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Side(str, Enum):
    BID = "bid"
    ASK = "ask"


@dataclass
class SealedBid:
    """An encrypted bid received by the TEE.

    The on-chain commitment is keccak256(ciphertext || nonce).
    Only the TEE can decrypt and act on the underlying intent.
    """
    commitment: bytes               # 32-byte on-chain commitment
    trader_xrpl_address: str        # XRPL address that will SEND XRP (for bids, this is the buyer; the seller delivers)
    xrp_amount: int                 # microXRP (1 XRP = 1_000_000 microXRP)
    xrp_price_micro_usd: int        # 1e6 = $1.00 implied
    expiry_unix: int
    received_at_unix: int

    # After TEE decrypts the sealed payload:
    bid_order_id: Optional[bytes] = None  # set when received from vault


@dataclass
class SealedAsk:
    commitment: bytes
    trader_flare_address: str       # Flare address that has escrowed FXRP
    xrp_amount: int
    xrp_price_micro_usd: int
    expiry_unix: int
    received_at_unix: int
    escrow_amount: int = 0          # FXRP locked in vault (6 decimals)
    ask_order_id: Optional[bytes] = None


@dataclass
class Match:
    match_id: bytes
    bid_order_id: bytes
    ask_order_id: bytes
    xrp_amount: int                 # amount settled
    xrp_price_micro_usd: int        # agreed price
    matched_at_unix: int
    ftso_reference_price: int       # FTSO price at match time (for audit)
    ftso_drift_bps: int             # basis points of drift from FTSO


@dataclass
class FDCAttestation:
    """An FDC V1 Payment attestation, fetched from the Flare Data Layer."""
    merkle_root: bytes
    proof: bytes
    response: bytes
    xrpl_tx_id: str                 # e.g. 64-char hex


@dataclass
class XRPLPaymentInstructions:
    """Instructions for the TEE-controlled XRPL escrow wallet (PMW)."""
    source_address: str             # PMW XRPL address
    destination_address: str        # bidder's XRPL address
    amount_drops: int               # in microXRP (drops)
    fee_drops: int = 12
    sequence: Optional[int] = None  # set when PMW is ready to sign
    signed_tx_blob: Optional[str] = None
    tx_id: Optional[str] = None


@dataclass
class vTPMQuote:
    """A vTPM-style attestation quote from the TEE.

    In production this is a real GCP Confidential Space OIDC token with
    embedded vTPM PCR values. For the hackathon demo on Coston2 we sign
    a deterministic payload with the TEE's ECDSA key registered in
    `WhisperVTPMVerifier`.
    """
    tee_id: bytes                   # 32 bytes identifying this TEE instance
    nonce: int                      # replay protection
    measurement: bytes              # expected image hash
    signature: bytes                # 65 bytes (r, s, v)
    image_reference: str = "whisper-tee-image-v1"
    public_key: Optional[bytes] = None

    def encode(self) -> bytes:
        return self.tee_id + self.nonce.to_bytes(32, "big") + self.signature


@dataclass
class SettlementResult:
    match_id: bytes
    xrpl_tx_id: str
    fxrp_released: int
    bidder_flare_address: str
    fdc_proof: FDCAttestation
    tee_quote: vTPMQuote
    completed_at_unix: int
