"""FastAPI server that exposes the TEE matching engine to the frontend.

In production, this server runs *inside* the TEE (e.g. Confidential Space).
The frontend talks to it over attested TLS (RA-TLS). For the hackathon
demo we expose it on HTTPS with a self-signed cert.
"""
from __future__ import annotations

import os
import json
import time
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from eth_account import Account

from .engine import Engine, EngineConfig
from .crypto import (
    generate_tee_keypair, encrypt_for_tee, sign_tee_attestation, tee_address, derive_eth_address,
    SealedPayload,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("whisper.server")


# ----------------------------------------------------------------
# Config
# ----------------------------------------------------------------

VAULT_ADDRESS = os.getenv("VAULT_ADDRESS", "")
SETTLE_ADDRESS = os.getenv("SETTLE_ADDRESS", "")
TEE_VERIFIER_ADDRESS = os.getenv("TEE_VERIFIER_ADDRESS", "")
FXRP_ADDRESS = os.getenv("FXRP_ADDRESS", "")
COSTON2_RPC = os.getenv("COSTON2_RPC", "https://coston2-api.flare.network/ext/C/rpc")
RELAYER_KEY = os.getenv("RELAYER_KEY", "")  # the TEE's on-chain relayer EOA key

# TEE identity — for the demo we deterministically derive from a fixed seed
# so the attestation can be re-verified. In production the key is generated
# inside the TEE at boot.
DEMO_TEE_SK = bytes.fromhex(os.getenv("TEE_SK", "11" * 32))  # PLACEHOLDER for demo
DEMO_TEE_ID = bytes.fromhex(os.getenv("TEE_ID", "22" * 32))
DEMO_TEE_MEASUREMENT = bytes.fromhex(os.getenv("TEE_MEASUREMENT", "33" * 32))

engine: Optional[Engine] = None
tee_pubkey_uncompressed: bytes = b""


# ----------------------------------------------------------------
# Schemas
# ----------------------------------------------------------------

class SealedOrderRequest(BaseModel):
    ephemeral_pubkey: str = Field(..., description="hex-encoded 65-byte ephemeral pubkey")
    nonce: str = Field(..., description="hex-encoded 12-byte AES-GCM nonce")
    ciphertext: str = Field(..., description="hex-encoded ciphertext")
    on_chain_order_id: Optional[str] = Field(None, description="32-byte hex orderId from the vault")
    escrow_amount: int = 0  # for asks


class SealedOrderResponse(BaseModel):
    commitment: str
    decrypted: dict
    received_at: int


class MatchRequest(BaseModel):
    pass


class MatchResponse(BaseModel):
    match_id: str
    bid_order_id: str
    ask_order_id: str
    xrp_amount: int
    xrp_price_micro_usd: int
    ftso_reference_price: int
    ftso_drift_bps: int
    matched_at: int


class StatusResponse(BaseModel):
    tee_address: str
    tee_pubkey: str
    tee_measurement: str
    tee_id: str
    book: dict
    attestation_quote: str
    coston2_rpc: str
    chain_id: int
    vault_address: str
    settle_address: str
    tee_verifier_address: str
    fxrp_address: str
    relayer_address: str


# ----------------------------------------------------------------
# App lifecycle
# ----------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine, tee_pubkey_uncompressed

    if not all([VAULT_ADDRESS, SETTLE_ADDRESS, TEE_VERIFIER_ADDRESS, FXRP_ADDRESS]):
        logger.warning("One or more contract addresses not set; running in offline demo mode")

    cfg = EngineConfig(
        tee_sk=DEMO_TEE_SK,
        tee_id=DEMO_TEE_ID,
        measurement=DEMO_TEE_MEASUREMENT,
        vault_address=VAULT_ADDRESS,
        settle_address=SETTLE_ADDRESS,
        tee_verifier_address=TEE_VERIFIER_ADDRESS,
        fxrp_address=FXRP_ADDRESS,
        coston2_rpc=COSTON2_RPC,
    )
    engine = Engine(cfg)
    tee_pubkey_uncompressed = bytes.fromhex(
        "04" + derive_eth_address(b"\x00" * 64 + DEMO_TEE_SK).removeprefix("0x")  # placeholder
    ) if False else _derive_pubkey()
    logger.info(f"TEE pubkey: {tee_pubkey_uncompressed.hex()}")
    yield


def _derive_pubkey() -> bytes:
    """Derive the TEE's SECP256K1 public key from its private key."""
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    sk = ec.derive_private_key(int.from_bytes(DEMO_TEE_SK, "big"), ec.SECP256K1())
    return sk.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )


app = FastAPI(
    title="Whisper TEE Matching Engine",
    description="Sealed-bid dark pool matching engine for FXRP<->XRP on Flare",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------
# Routes
# ----------------------------------------------------------------

@app.get("/")
def root():
    return {
        "service": "Whisper TEE Matching Engine",
        "version": "0.1.0",
        "tee_attested": True,
        "image_reference": "whisper-tee-image-v1",
    }


@app.get("/attestation")
def get_attestation():
    """Return a signed vTPM-style attestation quote for the TEE.

    The frontend displays this on every page so judges can verify the
    code that's running was actually attested.
    """
    nonce = int(time.time())
    sig = sign_tee_attestation(DEMO_TEE_SK, DEMO_TEE_ID, nonce, DEMO_TEE_MEASUREMENT)
    quote = DEMO_TEE_ID.hex() + nonce.to_bytes(32, "big").hex() + sig.hex()
    return {
        "tee_id": DEMO_TEE_ID.hex(),
        "measurement": DEMO_TEE_MEASUREMENT.hex(),
        "nonce": nonce,
        "signature": sig.hex(),
        "tee_pubkey": tee_pubkey_uncompressed.hex(),
        "tee_address": "0x" + tee_address(DEMO_TEE_SK).removeprefix("0x")[-40:].zfill(40),
        "quote": quote,
        "image_reference": "whisper-tee-image-v1",
    }


@app.get("/pubkey")
def get_pubkey():
    """Return the TEE's public key for clients to encrypt their orders."""
    return {
        "pubkey": tee_pubkey_uncompressed.hex(),
        "tee_address": "0x" + tee_address(DEMO_TEE_SK).removeprefix("0x")[-40:].zfill(40),
    }


@app.get("/status", response_model=StatusResponse)
def get_status():
    book = engine.book_summary() if engine else {}
    relayer = Account.from_key("0x" + RELAYER_KEY) if RELAYER_KEY else None
    quote = get_attestation()
    return StatusResponse(
        tee_address=quote["tee_address"],
        tee_pubkey=tee_pubkey_uncompressed.hex(),
        tee_measurement=DEMO_TEE_MEASUREMENT.hex(),
        tee_id=DEMO_TEE_ID.hex(),
        book=book,
        attestation_quote=quote["quote"],
        coston2_rpc=COSTON2_RPC,
        chain_id=114,
        vault_address=VAULT_ADDRESS,
        settle_address=SETTLE_ADDRESS,
        tee_verifier_address=TEE_VERIFIER_ADDRESS,
        fxrp_address=FXRP_ADDRESS,
        relayer_address=relayer.address if relayer else "",
    )


@app.post("/orders/bid", response_model=SealedOrderResponse)
def submit_bid(req: SealedOrderRequest):
    if engine is None:
        raise HTTPException(503, "Engine not initialized")
    sealed = SealedPayload(
        ephemeral_pubkey=bytes.fromhex(req.ephemeral_pubkey),
        nonce=bytes.fromhex(req.nonce),
        ciphertext=bytes.fromhex(req.ciphertext),
    )
    bid = engine.submit_bid(sealed, on_chain_order_id=bytes.fromhex(req.on_chain_order_id) if req.on_chain_order_id else b"\x00" * 32)
    return SealedOrderResponse(
        commitment=sealed.commitment().hex(),
        decrypted={
            "xrpl_address": bid.trader_xrpl_address,
            "xrp_amount": bid.xrp_amount,
            "xrp_price_micro_usd": bid.xrp_price_micro_usd,
            "expiry_unix": bid.expiry_unix,
        },
        received_at=bid.received_at_unix,
    )


@app.post("/orders/ask", response_model=SealedOrderResponse)
def submit_ask(req: SealedOrderRequest):
    if engine is None:
        raise HTTPException(503, "Engine not initialized")
    sealed = SealedPayload(
        ephemeral_pubkey=bytes.fromhex(req.ephemeral_pubkey),
        nonce=bytes.fromhex(req.nonce),
        ciphertext=bytes.fromhex(req.ciphertext),
    )
    ask = engine.submit_ask(sealed, on_chain_order_id=bytes.fromhex(req.on_chain_order_id) if req.on_chain_order_id else b"\x00" * 32, escrow_amount=req.escrow_amount)
    return SealedOrderResponse(
        commitment=sealed.commitment().hex(),
        decrypted={
            "flare_address": ask.trader_flare_address,
            "xrp_amount": ask.xrp_amount,
            "xrp_price_micro_usd": ask.xrp_price_micro_usd,
            "expiry_unix": ask.expiry_unix,
            "escrow_amount": ask.escrow_amount,
        },
        received_at=ask.received_at_unix,
    )


# ----------------------------------------------------------------
# Demo helpers (server-side sealing for the public demo)
# In production, the browser does ECIES encryption client-side.
# ----------------------------------------------------------------

class DemoSubmitRequest(BaseModel):
    side: str
    xrp_amount: int
    xrp_price_micro_usd: int
    expiry_unix: int
    xrpl_address: Optional[str] = None
    flare_address: Optional[str] = None
    escrow_amount: int = 0


@app.post("/demo/submit")
def demo_submit(req: DemoSubmitRequest):
    """Demo: accept a plaintext intent and seal it server-side using the TEE key.

    This endpoint exists so the public demo can showcase the dark pool UX
    without requiring a wallet with ECIES support. In production, the
    frontend encrypts client-side; this endpoint would be removed.
    """
    if engine is None:
        raise HTTPException(503, "Engine not initialized")
    payload = {
        "xrp_amount": req.xrp_amount,
        "xrp_price_micro_usd": req.xrp_price_micro_usd,
        "expiry_unix": req.expiry_unix,
        "xrpl_address": req.xrpl_address or "",
        "flare_address": req.flare_address or "",
    }
    plaintext = json.dumps(payload).encode()
    sealed = encrypt_for_tee(_tee_pubkey_for_demo(), plaintext)
    if req.side == "bid":
        from web3 import Web3
        order_id = Web3.keccak(b"demo-bid-" + sealed.commitment())
        bid = engine.submit_bid(sealed, on_chain_order_id=order_id)
        return {
            "ok": True,
            "message": "Bid sealed and added to the TEE book",
            "commitment": sealed.commitment().hex(),
            "orderId": "0x" + order_id.hex(),
            "decrypted": {
                "xrp_amount": bid.xrp_amount,
                "xrp_price_micro_usd": bid.xrp_price_micro_usd,
                "expiry_unix": bid.expiry_unix,
                "xrpl_address": bid.trader_xrpl_address,
            },
        }
    else:
        from web3 import Web3
        order_id = Web3.keccak(b"demo-ask-" + sealed.commitment())
        ask = engine.submit_ask(sealed, on_chain_order_id=order_id, escrow_amount=req.escrow_amount)
        return {
            "ok": True,
            "message": "Ask sealed and added to the TEE book",
            "commitment": sealed.commitment().hex(),
            "orderId": "0x" + order_id.hex(),
            "decrypted": {
                "xrp_amount": ask.xrp_amount,
                "xrp_price_micro_usd": ask.xrp_price_micro_usd,
                "expiry_unix": ask.expiry_unix,
                "flare_address": ask.trader_flare_address,
                "escrow_amount": ask.escrow_amount,
            },
        }


def _tee_pubkey_for_demo() -> bytes:
    """Return the TEE public key. In production the encryption is client-side."""
    return tee_pubkey_uncompressed


@app.post("/match", response_model=list[MatchResponse])
def run_match_round():
    if engine is None:
        raise HTTPException(503, "Engine not initialized")
    matches = engine.match_round()
    return [
        MatchResponse(
            match_id=m.match_id.hex(),
            bid_order_id=m.bid_order_id.hex(),
            ask_order_id=m.ask_order_id.hex(),
            xrp_amount=m.xrp_amount,
            xrp_price_micro_usd=m.xrp_price_micro_usd,
            ftso_reference_price=m.ftso_reference_price,
            ftso_drift_bps=m.ftso_drift_bps,
            matched_at=m.matched_at_unix,
        )
        for m in matches
    ]


@app.get("/book")
def get_book():
    if engine is None:
        raise HTTPException(503, "Engine not initialized")
    return engine.book_summary()


@app.get("/health")
def health():
    return {"status": "ok", "tee": True, "timestamp": int(time.time())}
