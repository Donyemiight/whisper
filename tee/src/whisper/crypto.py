"""Cryptographic primitives for the Whisper TEE.

The TEE holds a long-lived ECDSA key pair. The public key is registered on
the Flare `WhisperVTPMVerifier` contract. Clients encrypt their sealed bids
to this public key using ECIES (SECP256K1 + AES-GCM). Only the TEE can
decrypt.

For the hackathon build we use a deterministic key derivation so the demo
is reproducible. In production the key is generated inside the TEE at boot
and never exposed.
"""
from __future__ import annotations

import os
import hashlib
import secrets
from dataclasses import dataclass
from typing import Tuple

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


# ECIES using SECP256K1 (same curve as Ethereum / Flare) + AES-256-GCM.
# Output format: ephemeral_pubkey(65) || nonce(12) || ciphertext


def generate_tee_keypair() -> Tuple[bytes, bytes]:
    """Generate a fresh TEE key pair. Returns (private_key_bytes, public_key_bytes_uncompressed)."""
    sk = ec.generate_private_key(ec.SECP256K1())
    pk = sk.public_key()
    sk_bytes = sk.private_numbers().private_value.to_bytes(32, "big")
    pk_bytes = pk.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return sk_bytes, pk_bytes


def derive_eth_address(pubkey_uncompressed: bytes) -> str:
    """Convert a 65-byte uncompressed SECP256K1 pubkey to an Ethereum/Flare address."""
    assert len(pubkey_uncompressed) == 65 and pubkey_uncompressed[0] == 0x04
    h = hashlib.sha256(pubkey_uncompressed[1:]).digest()
    addr = "0x" + h[-20:].hex()
    return addr


def _ecdh_agreement(sk_bytes: bytes, peer_pubkey_uncompressed: bytes) -> bytes:
    sk = ec.derive_private_key(int.from_bytes(sk_bytes, "big"), ec.SECP256K1())
    peer = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256K1(), peer_pubkey_uncompressed)
    shared = sk.exchange(ec.ECDH(), peer)
    return shared


def _kdf(shared: bytes, info: bytes) -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=info,
    ).derive(shared)


@dataclass
class SealedPayload:
    """A sealed payload: ephemeral pubkey + nonce + ciphertext."""
    ephemeral_pubkey: bytes         # 65 bytes
    nonce: bytes                    # 12 bytes
    ciphertext: bytes               # variable, includes AEAD tag

    def commitment(self) -> bytes:
        return hashlib.sha256(self.ephemeral_pubkey + self.nonce + self.ciphertext).digest()

    def encode(self) -> bytes:
        return self.ephemeral_pubkey + self.nonce + self.ciphertext


def encrypt_for_tee(tee_pubkey_uncompressed: bytes, plaintext: bytes) -> SealedPayload:
    """Encrypt `plaintext` so only the holder of the TEE private key can decrypt."""
    # Generate ephemeral keypair
    eph_sk = ec.generate_private_key(ec.SECP256K1())
    eph_pk = eph_sk.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    shared = eph_sk.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256K1(), tee_pubkey_uncompressed))
    key = _kdf(shared, b"whisper-v1-aesgcm-key")
    nonce = secrets.token_bytes(12)
    ct = AESGCM(key).encrypt(nonce, plaintext, associated_data=None)
    return SealedPayload(ephemeral_pubkey=eph_pk, nonce=nonce, ciphertext=ct)


def decrypt_from_tee(tee_sk_bytes: bytes, sealed: SealedPayload) -> bytes:
    """Decrypt a sealed payload using the TEE's private key."""
    shared = _ecdh_agreement(tee_sk_bytes, sealed.ephemeral_pubkey)
    key = _kdf(shared, b"whisper-v1-aesgcm-key")
    return AESGCM(key).decrypt(sealed.nonce, sealed.ciphertext, associated_data=None)


def sign_tee_attestation(sk_bytes: bytes, tee_id: bytes, nonce: int, measurement: bytes) -> bytes:
    """Sign a vTPM-style attestation quote using the TEE private key.

    The on-chain verifier (`WhisperVTPMVerifier`) expects EIP-191 signatures:
        keccak256(teeId || nonce || measurement) -> eth_sign -> 65 bytes
    """
    from eth_account import Account
    from eth_account.messages import encode_defunct

    digest = hashlib.sha256(tee_id + nonce.to_bytes(32, "big") + measurement).digest()
    eth_digest = hashlib.sha256(
        b"\x19Ethereum Signed Message:\n32" + digest
    ).digest()

    # Use eth_account to sign
    sk = "0x" + sk_bytes.hex()
    sig = Account.unsafe_sign_hash(eth_digest, sk).signature
    # sig is HexBytes; convert to raw 65 bytes
    return bytes(sig)


def tee_address(sk_bytes: bytes) -> str:
    """Get the TEE's Ethereum/Flare address from its private key."""
    from eth_account import Account
    sk = "0x" + sk_bytes.hex()
    return Account.from_key(sk).address
