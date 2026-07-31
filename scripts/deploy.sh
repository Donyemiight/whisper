#!/bin/bash
# Deploy all Whisper contracts to Flare Coston2 testnet.
# Requires:
#   - PRIVATE_KEY env var (funded with C2FLR from https://faucet.flare.network)
#   - COSTON2_RPC env var (default: https://coston2-api.flare.network/ext/C/rpc)
#   - foundry (forge, cast) in PATH

set -e

# Force a known Coston2 RPC and an explicit deployer key.
# The deployer needs ~5 C2FLR. Get from https://faucet.flare.network using
# the address derived from PRIVATE_KEY.

if [ -z "$PRIVATE_KEY" ]; then
  echo "ERROR: PRIVATE_KEY env var is required"
  exit 1
fi

COSTON2_RPC="${COSTON2_RPC:-https://coston2-api.flare.network/ext/C/rpc}"
export FOUNDRY_ETH_RPC_URL="$COSTON2_RPC"

# Derive deployer address
DEPLOYER=$(cast wallet address --private-key $PRIVATE_KEY)
echo "Deployer address: $DEPLOYER"
BALANCE=$(cast balance $DEPLOYER --rpc-url $COSTON2_RPC --ether)
echo "Deployer balance: $BALANCE C2FLR"
if [ "$BALANCE" = "0.000000000000000000" ] || [ -z "$BALANCE" ]; then
  echo "ERROR: Deployer has no C2FLR. Get some from https://faucet.flare.network"
  exit 1
fi

cd /workspace/whisper/contracts

# Compute a deterministic TEE measurement for the demo deployment.
# For production, this is the sha256 of the actual Confidential Space image.
export TEE_IMAGE_MEASUREMENT="${TEE_IMAGE_MEASUREMENT:-0x$(echo -n 'whisper-tee-image-v1' | sha256sum | cut -d' ' -f1)}"

echo ""
echo "==> Deploying contracts to Coston2..."
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$COSTON2_RPC" \
  --private-key "$PRIVATE_KEY" \
  --broadcast

# Read the deployment JSON
if [ -f deployments.json ]; then
  echo ""
  echo "==> Deployed contracts:"
  cat deployments.json
  echo ""
  echo "==> Save these to your .env files:"
  cat deployments.json | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f'export {k.upper()}={v}') for k,v in d.items()]"
fi
