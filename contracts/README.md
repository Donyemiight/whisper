# Solidity contracts for Whisper

Deployed to **Flare Coston2 testnet** (chain ID 114).

## Contracts

| Contract | Purpose |
|---|---|
| `WhisperVault.sol` | Holds sealed bids/asks (commitment hashes), accepts match attestations from the TEE, releases FXRP on settlement |
| `WhisperSettle.sol` | Coordinates the two-leg settlement: receives FDC payment proof, triggers FXRP transfer |
| `VTPMVerifier.sol` | Verifies the TEE's vTPM quote against the registered measurement (per `flare-vtpm-attestation`) |

## Build

```bash
forge install
forge build
forge test -vvv
```

## Deploy

```bash
export COSTON2_RPC=https://coston2-api.flare.network/ext/C/rpc
export PRIVATE_KEY=0x...
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $COSTON2_RPC \
  --broadcast \
  --verify
```

## Key references

- `FlareContractRegistry`: `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` (same on all Flare networks)
- `FtsoV2` (Coston2): `0x3d893C53D9e8056135C26C8c638B76C8b60Df726`
- `FdcVerification` (Coston2): via ContractRegistry
- `flare-periphery-contracts` npm package for typed interfaces
- `flare-vtpm-attestation` for the on-chain TEE verification
