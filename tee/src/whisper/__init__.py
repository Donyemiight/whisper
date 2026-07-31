"""Whisper TEE matching engine.

The matching engine runs inside a Trusted Execution Environment (TEE) — in
production, a GCP Confidential Space instance built on the
`flare-foundation/flare-ai-kit` SDK. For the hackathon demo on Coston2 we run
the same logic with the dev attestation layer (the same code paths, just with
a mock vTPM quote).

Public API:
    Engine.submit_bid(...)     -> SealedBid
    Engine.submit_ask(...)     -> SealedAsk
    Engine.match_round(...)    -> list[Match]
    Engine.settle_match(...)   -> SettlementResult
"""
from .engine import Engine, EngineConfig
from .crypto import SealedPayload, encrypt_for_tee, decrypt_from_tee
from .models import (
    Side, SealedBid, SealedAsk, Match, SettlementResult,
    FDCAttestation, XRPLPaymentInstructions, vTPMQuote,
)

__all__ = [
    "Engine", "EngineConfig",
    "SealedPayload", "encrypt_for_tee", "decrypt_from_tee",
    "Side", "SealedBid", "SealedAsk", "Match", "SettlementResult",
    "FDCAttestation", "XRPLPaymentInstructions", "vTPMQuote",
]

__version__ = "0.1.0"
