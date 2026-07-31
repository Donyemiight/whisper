# Deploying Whisper to Flare Coston2 + Render

This document walks through the full deployment:

1. Contracts → Coston2 testnet
2. TEE engine → Render (Docker)
3. XRPL relay → Render (Docker)
4. Frontend → Render (Docker)
5. Wire everything together

---

## 0. Prerequisites

- **A funded Coston2 deployer account.** Get testnet C2FLR from
  [https://faucet.flare.network](https://faucet.flare.network). ~5 C2FLR is
  enough to deploy.
- **Foundry** (forge, cast, anvil) installed. [Install guide](https://book.getfoundry.sh/getting-started/installation).
- **A Render account** with API access.
- **Domain** (optional, ~$12/yr for `.xyz`).

---

## 1. Deploy contracts to Coston2

```bash
cd contracts
cp .env.example .env
# Edit .env:
#   PRIVATE_KEY=<your funded Coston2 private key, 0x...>
#   COSTON2_RPC=https://coston2-api.flare.network/ext/C/rpc
#   TEE_IMAGE_MEASUREMENT=0x<sha256 of the TEE image you plan to run>

source .env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $COSTON2_RPC \
  --broadcast

# Output is written to ./deployments.json
cat deployments.json
```

You should see something like:

```json
{
  "fxrp": "0x...",
  "teeVerifier": "0x...",
  "vault": "0x...",
  "settle": "0x...",
  "teeMeasurement": "0x..."
}
```

**Save these addresses** — you'll need them in step 4.

If you want to interact with the live deployment from the CLI:

```bash
export VAULT=<from deployments.json>
export TEE_VERIFIER=<from deployments.json>
export SETTLE=<from deployments.json>

# Read the TEE verifier
cast call $TEE_VERIFIER "expectedMeasurement()(bytes32)" --rpc-url $COSTON2_RPC
```

---

## 2. Register the TEE identity

The TEE server (next step) will hold a SECP256K1 key pair. The public key
must be registered on `WhisperVTPMVerifier` so the on-chain verifier knows
what signatures to accept.

```bash
# After you run the TEE for the first time, it'll log its TEE address.
# Then register that address:
export TEE_ADDRESS=<from TEE server log>
cast send $TEE_VERIFIER "registerTEE(bytes32,address,bytes32)" \
  $TEE_ID \
  $TEE_ADDRESS \
  $TEE_IMAGE_MEASUREMENT \
  --private-key $PRIVATE_KEY \
  --rpc-url $COSTON2_RPC
```

(`$TEE_ID` is the 32-byte TEE identity you configured. For the demo it's
hardcoded to `0x2222...`; for production it's set inside the TEE at boot.)

---

## 3. Run the TEE matching engine

The TEE engine runs as a Docker container on Render. For the hackathon demo
we run the dev attestation layer (same code path, mocked vTPM quote). For
production, swap the image for the Confidential Space image built from
`flare-ai-kit`.

```bash
cd ../tee
docker build -t whisper-tee .

# Local test
docker run --rm -p 8787:8787 \
  -e VAULT_ADDRESS=$VAULT \
  -e SETTLE_ADDRESS=$SETTLE \
  -e TEE_VERIFIER_ADDRESS=$TEE_VERIFIER \
  -e FXRP_ADDRESS=$FXRP \
  -e COSTON2_RPC=https://coston2-api.flare.network/ext/C/rpc \
  -e TEE_SK=$TEE_SK \
  -e TEE_ID=$TEE_ID \
  -e TEE_MEASUREMENT=$TEE_IMAGE_MEASUREMENT \
  -e RELAYER_KEY=$RELAYER_KEY \
  whisper-tee
```

Verify:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/status | python3 -m json.tool
```

---

## 4. Run the XRPL relay

```bash
cd ../xrpl-relay
docker build -t whisper-xrpl .
docker run --rm -p 8788:8788 \
  -e XRPL_WSS=wss://s.altnet.rippletest.net:51233/ \
  -e TEE_INTERNAL_URL=http://host.docker.internal:8787 \
  whisper-xrpl
```

This funds a fresh XRPL testnet PMW (faucet) and exposes it on :8788.

---

## 5. Run the frontend

```bash
cd ../frontend
docker build -t whisper-frontend .

docker run --rm -p 3000:3000 \
  -e TEE_API_URL=http://host.docker.internal:8787 \
  -e XRPL_API_URL=http://host.docker.internal:8788 \
  -e NEXT_PUBLIC_FLARE_RPC=https://coston2-api.flare.network/ext/C/rpc \
  whisper-frontend
```

Visit http://localhost:3000 and walk through the demo.

---

## 6. Deploy to Render (production)

`render.yaml` defines the full multi-service stack:

```bash
# Connect the repo to Render
# Render detects render.yaml and creates:
#   - whisper-frontend (Next.js)
#   - whisper-tee (Python TEE engine)
#   - whisper-xrpl (TypeScript XRPL relay)
#   - whisper-redis (optional, for the order book cache)

# Set the env vars on each service (Render Dashboard → Environment):
#   TEE_API_URL=http://whisper-tee:8787
#   XRPL_API_URL=http://whisper-xrpl:8788
#   VAULT_ADDRESS, SETTLE_ADDRESS, etc.
#   TEE_SK, TEE_ID, TEE_MEASUREMENT, RELAYER_KEY
```

If Render free-tier auto-deploy is sluggish (it sometimes is), trigger a
manual deploy from the Render dashboard.

---

## 7. Smoke test the live deployment

```bash
# Verify the frontend is up
curl -sI https://whisper-frontend.onrender.com/

# Verify the TEE engine
curl -s https://whisper-tee.onrender.com/health

# Submit a sealed bid (through the frontend UI or via API)
curl -X POST https://whisper-tee.onrender.com/demo/submit \
  -H "Content-Type: application/json" \
  -d '{
    "side": "bid",
    "xrp_amount": 1000000000,
    "xrp_price_micro_usd": 2500000,
    "expiry_unix": 9999999999,
    "xrpl_address": "r..."
  }'

# Read the live book
curl -s https://whisper-tee.onrender.com/book | python3 -m json.tool
```

---

## Troubleshooting

**`forge` says the FDC V1 contract isn't on the right address.**
The FlareContractRegistry at `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`
always returns the address for your current network — call it on the
correct RPC.

**`cast send` fails with insufficient funds.**
Get more C2FLR from the faucet. The contract deployment needs ~3-5 C2FLR.

**The TEE server logs "FTSO read failed" on every match round.**
The public Coston2 RPC has 2-3s cache lag on `eth_call`. The engine falls
back to skipping the round; matches still work, just without FTSO drift
verification. For a production deployment, run your own Flare node or use
a private RPC with consistent state.

**The frontend says "TEE offline".**
Check the `TEE_API_URL` env var on the frontend service. If you're using
Render's internal DNS, it should be `http://whisper-tee:8787`. If you're
exposing the TEE publicly, use the public URL.
