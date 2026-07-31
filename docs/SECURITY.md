# Security model

Whisper is a sealed-bid dark pool for FXRP ↔ native XRP. This document
describes the security guarantees, the threat model, and the production
upgrade path beyond the hackathon build.

---

## What we guarantee

For every trade settled through Whisper:

1. **Pre-trade privacy.** The bid/ask payload is encrypted to the TEE's
   SECP256K1 public key with ECIES. Only the TEE can decrypt it. The
   on-chain commitment is keccak256(ephemeral_pubkey || nonce || ciphertext)
   — it reveals nothing about price, size, or parties.

2. **In-trade privacy.** The matching engine runs inside the TEE. The
   order book is decrypted only inside the enclave. No on-chain observer
   (or TEE operator) can see the live book.

3. **Verifiability.** Every match is signed by the TEE's ECDSA key
   (registered on `WhisperVTPMVerifier`). The on-chain verifier
   re-computes the hash, calls `ecrecover`, and rejects any match whose
   signature doesn't recover to a registered TEE key.

4. **Two-leg settlement.** The XRPL Payment is signed by the
   TEE-controlled PMW address. The FXRP release is gated on a valid FDC
   V1 Payment attestation proving the XRPL tx settled. Neither leg can
   be forged without the corresponding private key.

5. **Selective disclosure.** The architecture mirrors XLS-0096's
   auditor-key model. The TEE can decrypt and reveal a specific trade
   to a designated auditor/regulator (via an authenticated side-channel
   to the TEE), while keeping it private from the public. This is the
   "regulated privacy, not anonymous privacy" model that institutional
   players require.

---

## What we do *not* guarantee

1. **Anonymity from the TEE operator.** The TEE operator sees the
   decrypted book (this is a fundamental property of TEE models). For
   the hackathon, the operator is us. In production, the operator is a
   consortium of independent parties running Confidential Space
   instances, mirroring Flare's data-provider model.

2. **Anonymity between matched counterparties.** Both parties learn
   each other's addresses at settlement. This is the same disclosure
   model as a regular DEX. If you need true unlinkability, that's a
   ZK-rollup problem, not a TEE problem.

3. **Front-running of the FDC attestation.** The 90s FDC round is a
   brief window where the matched trade is on the way to settlement. A
   front-runner can see the XRPL Payment on the public XRPL ledger.
   However, by the time it's visible, the FXRP leg is also being
   settled — there's no profitable action for a front-runner.

---

## Threat model

| Adversary | Capability | Mitigation |
|---|---|---|
| **Passive on-chain observer** | Reads all Coston2 transactions | Sealed commitments reveal nothing |
| **Passive XRPL observer** | Reads all XRPL transactions | TEE signs the Payment; only the parties learn the destinations |
| **Active block reorg attacker** | Reorders Coston2 blocks | TEE nonce on the quote prevents replay; FDC finality ensures the XRPL leg is irreversible |
| **Malicious TEE operator** | Tries to see the book | In production: Confidential Space + vTPM attestation; operator never sees plaintext. In hackathon: dev attestation layer, single operator. |
| **Malicious TEE key holder** | Forges a match attestation | On-chain verifier checks the signature against the registered TEE identity |
| **Compromised FDC** | Forges a Payment proof | FDC is decentralized across Flare data providers; FDC V2 uses TEE-based attestations on the same confidential compute plane |
| **Replay attacker** | Re-submits a valid match attestation | TEE nonce + `consumedMatches` mapping prevents replay |

---

## Production upgrade path

The hackathon build uses a **dev attestation layer** — the TEE is a
regular Docker container with a deterministic key pair, and the on-chain
verifier checks the signature against the registered identity. This lets
us demo the full flow on Coston2 today.

For production, the upgrade is:

1. **TEE = Confidential Space.** Replace the `tee/Dockerfile` with the
   `flare-ai-kit` Confidential Space image. The TEE key is generated
   inside the enclave at boot and never exposed. Remote attestation
   produces a vTPM quote with real PCR values.

2. **On-chain verifier = full vTPM verification.** Replace
   `WhisperVTPMVerifier` (which currently checks a secp256k1
   signature) with a full vTPM quote verifier from
   `flare-foundation/flare-vtpm-attestation`. The contract now checks:
   - The OIDC token is from GCP Confidential Space
   - The image hash matches the registered measurement
   - The PCR values match the expected enclave configuration
   - The nonce is fresh

3. **PMW = real Protocol Managed Wallet.** The current XRPL relay
   simulates the PMW with a regular wallet. In production, the
   Flare-side PMW contracts (`PMWPayment`, `PMWMultisigAccount`) hold
   the XRPL keys in a TEE-controlled multisig.

4. **FDC V1 → FDC V2.** Switch from the batched FDC V1 to the
   TEE-based FDC V2 (which is launching on Songbird in July 2026 per
   the Flare roadmap). FDC V2 reduces the attestation round from 90s
   to single-digit seconds.

5. **Multi-party TEE.** Move from a single TEE to a consortium
   matching the data-provider model — N independent TEE operators, K
   of N must agree on a match for it to be accepted on-chain.

---

## Bug bounty

The hackathon version is unaudited. The production upgrade (above) is
what we'd put in front of an auditor. The OpenZeppelin and Zellic
audits of FAssets, FDC, and FlareVtpmAttestation (referenced in the
contracts) cover the underlying primitives we use.
