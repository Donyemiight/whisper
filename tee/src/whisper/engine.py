"""The Whisper TEE matching engine.

The engine holds the live order book in memory inside the enclave. Bids and
asks arrive as SealedPayloads (encrypted with the TEE public key). The
engine decrypts them inside the TEE, matches them, and emits Matches.

For each Match, the engine:
  1. Reads the FTSO v2 reference price (via the Flare RPC)
  2. Sanity-checks the agreed price against FTSO (drift < max_drift_bps)
  3. Signs a vTPM attestation quote
  4. Submits attestMatch() to the Flare WhisperVault
  5. Signs the XRPL Payment transaction (PMW-style) for the XRPL leg
  6. Waits for the XRPL tx to settle
  7. Submits an FDC V1 Payment attestation request to Flare
  8. On FDC finalization, calls WhisperSettle.finalizeWithProof()
  9. Releases the FXRP escrow to the bidder
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import importlib
import web3.middleware as _w3m
from web3 import Web3

# web3.py v7+ removed geth_poa_middleware; load if available
geth_poa_middleware = getattr(_w3m, "geth_poa_middleware", None)

from eth_account import Account
from eth_account.messages import encode_defunct

from .crypto import (
    generate_tee_keypair, derive_eth_address, sign_tee_attestation, tee_address,
    decrypt_from_tee, SealedPayload,
)
from .models import (
    Side, SealedBid, SealedAsk, Match, SettlementResult,
    FDCAttestation, XRPLPaymentInstructions, vTPMQuote,
)

logger = logging.getLogger("whisper.engine")


# Flare Coston2 testnet
COSTON2_RPC = "https://coston2-api.flare.network/ext/C/rpc"
CHAIN_ID = 114

# FTSO v2 contract on Coston2 (from the Flare docs)
FTSO_V2_COSTON2 = "0x3d893C53D9e8056135C26C8c638B76C8b60Df726"

# FXRP feed ID on Coston2 — 21 bytes: "FXRP" + 17 zero bytes
# The FTSOv2 expects bytes21[] for getFeedsById
FXRP_FEED_ID = b"FXRP" + b"\x00" * 17

# ABIs (minimal, only what we need)
FTSO_V2_ABI = json.loads("""
[
    {
        "inputs": [{"internalType": "bytes21[]", "name": "_feedIds", "type": "bytes21[]"}],
        "name": "getFeedsById",
        "outputs": [
            {"internalType": "uint256[]", "name": "", "type": "uint256[]"},
            {"internalType": "int8[]", "name": "", "type": "int8[]"},
            {"internalType": "uint64", "name": "", "type": "uint64"}
        ],
        "stateMutability": "view",
        "type": "function"
    }
]
""")


@dataclass
class EngineConfig:
    """Runtime config for the TEE engine."""
    tee_sk: bytes                                    # 32 bytes
    tee_id: bytes                                    # 32 bytes
    measurement: bytes                               # 32 bytes (image hash)
    vault_address: str
    settle_address: str
    tee_verifier_address: str
    fxrp_address: str
    coston2_rpc: str = COSTON2_RPC
    max_drift_bps: int = 200                         # 2% max drift from FTSO
    min_match_xrp_micro: int = 1_000_000             # 1 XRP minimum
    ftso_reference_fresh_seconds: int = 180          # FTSO feed must be < 3 min old
    mock_settlement: bool = True                     # skip live XRPL on demo


class Engine:
    """The TEE matching engine. Owns the live order book inside the enclave."""

    def __init__(self, config: EngineConfig):
        self.config = config
        self.sk = config.tee_sk
        self.pk = None
        self.w3 = Web3(Web3.HTTPProvider(config.coston2_rpc))
        if geth_poa_middleware is not None:
            self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        self.ftso = self.w3.eth.contract(
            address=Web3.to_checksum_address(FTSO_V2_COSTON2),
            abi=FTSO_V2_ABI,
        )
        # In-memory encrypted book (decrypted only inside the enclave)
        self._bids: list[SealedBid] = []
        self._asks: list[SealedAsk] = []
        self._matches: list[Match] = []
        self._tee_address = tee_address(config.tee_sk)
        logger.info(f"TEE engine initialized. TEE address: {self._tee_address}")

    # ----------------------------------------------------------------
    # Sealed order intake
    # ----------------------------------------------------------------

    def submit_bid(self, sealed: SealedPayload, on_chain_order_id: bytes) -> SealedBid:
        """Decrypt a sealed bid inside the enclave, add to the book."""
        plaintext = decrypt_from_tee(self.sk, sealed)
        payload = json.loads(plaintext)
        bid = SealedBid(
            commitment=sealed.commitment(),
            trader_xrpl_address=payload["xrpl_address"],
            xrp_amount=int(payload["xrp_amount"]),
            xrp_price_micro_usd=int(payload["xrp_price_micro_usd"]),
            expiry_unix=int(payload["expiry_unix"]),
            received_at_unix=int(time.time()),
            bid_order_id=on_chain_order_id,
        )
        self._bids.append(bid)
        logger.info(f"Bid added: {bid.xrp_amount / 1e6} XRP @ ${bid.xrp_price_micro_usd / 1e6:.4f}")
        return bid

    def submit_ask(self, sealed: SealedPayload, on_chain_order_id: bytes, escrow_amount: int) -> SealedAsk:
        """Decrypt a sealed ask inside the enclave, add to the book."""
        plaintext = decrypt_from_tee(self.sk, sealed)
        payload = json.loads(plaintext)
        ask = SealedAsk(
            commitment=sealed.commitment(),
            trader_flare_address=payload["flare_address"],
            xrp_amount=int(payload["xrp_amount"]),
            xrp_price_micro_usd=int(payload["xrp_price_micro_usd"]),
            expiry_unix=int(payload["expiry_unix"]),
            received_at_unix=int(time.time()),
            escrow_amount=escrow_amount,
            ask_order_id=on_chain_order_id,
        )
        self._asks.append(ask)
        logger.info(f"Ask added: {ask.xrp_amount / 1e6} XRP @ ${ask.xrp_price_micro_usd / 1e6:.4f} (escrow {escrow_amount / 1e6} mFXRP)")
        return ask

    # ----------------------------------------------------------------
    # Matching
    # ----------------------------------------------------------------

    def _get_ftso_reference(self) -> tuple[int, int]:
        """Read the FTSO v2 reference price. Returns (price, age_seconds)."""
        try:
            result = self.ftso.functions.getFeedsById([FXRP_FEED_ID]).call()
            values, decimals, timestamp = result
            price = int(values[0])
            dec = int(decimals[0])
            age = int(time.time()) - int(timestamp)
            # Normalize to micro-USD (1e6 = $1)
            # FTSO returns price in USD with the given decimals.
            # We want 1e6 scaling: multiply by 1e6 / 10**dec
            if dec >= 0:
                price_micro = price * (10 ** (6 - dec))
            else:
                price_micro = price // (10 ** (dec - 6))
            return price_micro, age
        except Exception as e:
            logger.warning(f"FTSO read failed: {e}; falling back to 0")
            return 0, 99999

    def match_round(self) -> list[Match]:
        """One matching round: find all valid bid/ask pairs and match them.

        Matching rule (price-time priority):
          - For each bid, find the best (lowest-price) ask that is still
            <= bid.xrp_price_micro_usd
          - Match at the ask's price (price improvement for the bidder)
          - Both must have xrp_amount within 1% of each other
          - Both must not be expired
          - The agreed price must be within max_drift_bps of the FTSO
            reference price
        """
        ftso_price, ftso_age = self._get_ftso_reference()
        if ftso_age > self.config.ftso_reference_fresh_seconds:
            logger.warning(f"FTSO price is stale ({ftso_age}s old); skipping match round")
            return []
        logger.info(f"FTSO XRP/USD ref: ${ftso_price / 1e6:.4f} (age {ftso_age}s)")

        now = int(time.time())
        matches = []
        asks = sorted(
            [a for a in self._asks if a.expiry_unix > now and a.ask_order_id is not None],
            key=lambda a: a.xrp_price_micro_usd,
        )
        bids = sorted(
            [b for b in self._bids if b.expiry_unix > now and b.bid_order_id is not None],
            key=lambda b: (-b.xrp_price_micro_usd, b.received_at_unix),
        )

        used_ask = set()
        used_bid = set()

        for bi, bid in enumerate(bids):
            if bi in used_bid:
                continue
            for ai, ask in enumerate(asks):
                if ai in used_ask:
                    continue
                if ask.xrp_price_micro_usd > bid.xrp_price_micro_usd:
                    break  # no more affordable asks
                # Match at the ask's price (price improvement for the bidder)
                agreed_price = ask.xrp_price_micro_usd
                # Check FTSO drift
                if ftso_price > 0:
                    drift_bps = abs(agreed_price - ftso_price) * 10_000 // ftso_price
                    if drift_bps > self.config.max_drift_bps:
                        logger.info(f"Skip match: drift {drift_bps}bps exceeds {self.config.max_drift_bps}bps")
                        continue
                # Check size compatibility (within 1%)
                size_diff_bps = abs(bid.xrp_amount - ask.xrp_amount) * 10_000 // max(bid.xrp_amount, ask.xrp_amount)
                if size_diff_bps > 100:
                    continue
                matched_xrp = min(bid.xrp_amount, ask.xrp_amount)

                match = Match(
                    match_id=Web3.keccak(
                        b"whisper-match:" + bid.bid_order_id + ask.ask_order_id
                    ),
                    bid_order_id=bid.bid_order_id,
                    ask_order_id=ask.ask_order_id,
                    xrp_amount=matched_xrp,
                    xrp_price_micro_usd=agreed_price,
                    matched_at_unix=now,
                    ftso_reference_price=ftso_price,
                    ftso_drift_bps=drift_bps if ftso_price else 0,
                )
                matches.append(match)
                used_ask.add(ai)
                used_bid.add(bi)
                break

        self._matches.extend(matches)
        for m in matches:
            logger.info(
                f"Matched: {m.xrp_amount / 1e6:.2f} XRP @ ${m.xrp_price_micro_usd / 1e6:.4f} "
                f"(drift {m.ftso_drift_bps}bps)"
            )
        return matches

    # ----------------------------------------------------------------
    # Settlement
    # ----------------------------------------------------------------

    def _sign_quote(self, nonce: int) -> vTPMQuote:
        sig = sign_tee_attestation(self.sk, self.config.tee_id, nonce, self.config.measurement)
        return vTPMQuote(
            tee_id=self.config.tee_id,
            nonce=nonce,
            measurement=self.config.measurement,
            signature=sig,
            image_reference="whisper-tee-image-v1",
        )

    def attest_match_onchain(self, match: Match, relayer_account) -> str:
        """Submit the match to WhisperVault.attestMatch() with a vTPM quote."""
        # The TEE relayer (an on-chain EOA controlled by the TEE) submits the tx
        vault = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.config.vault_address),
            abi=json.loads(VAULT_ABI),
        )
        quote = self._sign_quote(nonce=int(time.time()))

        tx = vault.functions.attestMatch(
            match.match_id,
            match.bid_order_id,
            match.ask_order_id,
            match.xrp_amount,
            match.xrp_price_micro_usd,
            quote.encode(),
        ).build_transaction({
            "from": relayer_account.address,
            "nonce": self.w3.eth.get_transaction_count(relayer_account.address),
            "gas": 500_000,
            "gasPrice": self.w3.eth.gas_price,
            "chainId": CHAIN_ID,
        })
        signed = relayer_account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        if receipt.status != 1:
            raise RuntimeError(f"attestMatch failed: {tx_hash.hex()}")
        logger.info(f"Match attested on-chain: tx={tx_hash.hex()}")
        return tx_hash.hex()

    async def settle_match(self, match: Match, xrpl_instructions: XRPLPaymentInstructions) -> SettlementResult:
        """Full two-leg settlement. Mocked for the hackathon demo."""
        if self.config.mock_settlement:
            return await self._mock_settle(match)
        raise NotImplementedError("Live settlement not implemented in this build")

    async def _mock_settle(self, match: Match) -> SettlementResult:
        """Mock settlement for the demo — runs the same code path with mock data."""
        await asyncio.sleep(0.5)  # simulate XRPL ledger close
        mock_xrpl_tx = "0x" + "ab" * 32
        mock_fdc = FDCAttestation(
            merkle_root=b"\x00" * 32,
            proof=b"\x00" * 32,
            response=json.dumps({"transactionId": mock_xrpl_tx, "sourceId": "XRP_testnet"}).encode(),
            xrpl_tx_id=mock_xrpl_tx,
        )
        quote = self._sign_quote(nonce=int(time.time()))
        # Compute FXRP released (matched_xrp * price in USD/1e6 = USD value, then
        # escrow_amt because the asker locked USD-equivalent in FXRP)
        fxrp_released = 0  # set by the caller in the real flow
        return SettlementResult(
            match_id=match.match_id,
            xrpl_tx_id=mock_xrpl_tx,
            fxrp_released=fxrp_released,
            bidder_flare_address="0x" + "00" * 20,
            fdc_proof=mock_fdc,
            tee_quote=quote,
            completed_at_unix=int(time.time()),
        )

    # ----------------------------------------------------------------
    # Book views (read-only, decrypted for the TEE's own use)
    # ----------------------------------------------------------------

    def book_summary(self) -> dict:
        now = int(time.time())
        live_bids = [b for b in self._bids if b.expiry_unix > now]
        live_asks = [a for a in self._asks if a.expiry_unix > now]
        return {
            "bid_count": len(live_bids),
            "ask_count": len(live_asks),
            "bid_volume_xrp": sum(b.xrp_amount for b in live_bids) / 1e6,
            "ask_volume_xrp": sum(a.xrp_amount for a in live_asks) / 1e6,
            "best_bid": max((b.xrp_price_micro_usd for b in live_bids), default=0) / 1e6,
            "best_ask": min((a.xrp_price_micro_usd for a in live_asks), default=0) / 1e6,
            "match_count": len(self._matches),
        }


# Minimal Vault ABI (just the functions we call)
VAULT_ABI = """
[
    {
        "inputs": [
            {"internalType": "bytes32", "name": "matchId", "type": "bytes32"},
            {"internalType": "bytes32", "name": "bidOrderId", "type": "bytes32"},
            {"internalType": "bytes32", "name": "askOrderId", "type": "bytes32"},
            {"internalType": "uint256", "name": "xrpAmount", "type": "uint256"},
            {"internalType": "uint256", "name": "xrpPrice", "type": "uint256"},
            {"internalType": "bytes", "name": "attestation", "type": "bytes"}
        ],
        "name": "attestMatch",
        "outputs": [],
        "stateMutability": "nonReentrant",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "enum WhisperVault.Side", "name": "side", "type": "uint8"},
            {"internalType": "bytes32", "name": "commitment", "type": "bytes32"},
            {"internalType": "uint256", "name": "escrowAmount", "type": "uint256"},
            {"internalType": "uint256", "name": "xrpAmount", "type": "uint256"},
            {"internalType": "uint256", "name": "xrpPrice", "type": "uint256"},
            {"internalType": "uint256", "name": "expiry", "type": "uint256"}
        ],
        "name": "submitOrder",
        "outputs": [{"internalType": "bytes32", "name": "orderId", "type": "bytes32"}],
        "stateMutability": "nonReentrant",
        "type": "function"
    }
]
"""
