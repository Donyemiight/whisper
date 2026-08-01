# Fund the Whisper deployer on Coston2

The live demo at **https://whisper-frontend-pm7d.onrender.com** is fully working
(in-process TEE engine). To upgrade to **live on-chain mode** with real
contract addresses, you need to fund the deployer and I can deploy.

## Your deployer (corrected address)

The address in earlier docs had a typo. The **correct** deployer is:

```
Address:     0x0b6A564E9dC664b9223FFDAe35dD585cfC010B12
Private key: f35d4bdf9f3822b62b752545f22de0d094e91fda37cd875804ccbc51629eff87
```

## How to fund (3 minutes)

1. Open **https://faucet.flare.network** in your browser
2. Make sure the dropdown is set to **"Coston2"** (not Coston or Flare mainnet)
3. Paste the address above: `0x0b6A564E9dC664b9223FFDAe35dD585cfC010B12`
4. Click **"Request C2FLR"**
5. You'll get **100 C2FLR + 10 FXRP + 10 USDT0** in one claim
6. Tell me when done (just say "funded") and I'll deploy the contracts

## What happens after you say "funded"

I'll run this:

```bash
cd /workspace/whisper
PRIVATE_KEY=f35d4bdf9f3822b62b752545f22de0d094e91fda37cd875804ccbc51629eff87 \
  bash scripts/deploy.sh
```

This will deploy 4 contracts to Coston2 and write the addresses to
`contracts/deployments.json`:

| Contract | Purpose |
|---|---|
| `WhisperVTPMVerifier` | On-chain TEE identity + signature verification |
| `MockFXRP` | Testnet FXRP token (replaced by real FXRP on mainnet) |
| `WhisperVault` | Sealed bid/ask commitments + match attestations |
| `WhisperSettle` | Two-leg settlement with FDC V1 Payment attestation |

I'll then:
1. **Register the TEE identity** on the verifier contract (so matches are accepted)
2. **Update the Render env vars** with the deployed addresses
3. **Test the live URL** end-to-end (submit bid → submit ask → match → settle)
4. **Send you the test report** with on-chain tx hashes for the submission
5. **Update DORAHACKS-SUBMISSION.md** with the real contract addresses

## Total time

- Funding: 3 min (your action)
- Deploy + test: 5 min (my action)
- Total: ~8 min until the live URL is running on real Coston2 contracts

## Already deployed?

If the address is already funded, just say "funded" and I'll start.
