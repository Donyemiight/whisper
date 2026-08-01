#!/usr/bin/env bash
# Live end-to-end test against deployed Coston2 contracts
# Run AFTER setting Render env vars and Manual Deploying
set -e

PRIVATE_KEY=0xf35d4bdf9f3822b62b752545f22de0d094e91fda37cd875804ccbc51629eff87
VAULT=0x8Aa32cA2AFc5C9E8173D882C1Efd72587e60ba33
TEE_VERIFIER=0x9FF9b136A7321EDDA152706df4458d69E7C9F3d9
FXRP=0x4c765bac23F792b3954fEF6A8E22fb87634cEdCa
SETTLE=0xBc910dbE4ad4155AaAd651421f95d7A494660071
RPC=https://coston2-api.flare.network/ext/C/rpc
export PATH="$HOME/.foundry/bin:$PATH"

echo "=== Step 1: Verify contracts deployed ==="
for addr in $VAULT $TEE_VERIFIER $FXRP $SETTLE; do
  code=$(cast code $addr --rpc-url $RPC)
  if [ "$code" = "0x" ]; then
    echo "  ERROR: $addr has no code"
    exit 1
  else
    echo "  ✓ $addr has code (${#code} chars)"
  fi
done

echo ""
echo "=== Step 2: Verify TEE registered on-chain ==="
TEE_ID=0x2222222222222222222222222222222222222222222222222222222222222222
TEE_ADDRESS=0x131E4A54aB221929834815c99195dAec316aC270
registered=$(cast call $TEE_VERIFIER "registeredTEEs(bytes32)(bool)" $TEE_ID --rpc-url $RPC 2>&1)
echo "  TEE registered: $registered"
if [[ ! "$registered" == *"true"* ]]; then
  echo "  ERROR: TEE not registered"
  exit 1
fi
echo "  ✓ TEE registered on WhisperVTPMVerifier"

echo ""
echo "=== Step 3: Test submitOrder on WhisperVault ==="
# Approve mFXRP to vault
cast send $FXRP "approve(address,uint256)" $VAULT 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
  --rpc-url $RPC --private-key $PRIVATE_KEY 2>&1 | grep "status" | head -1

# Submit a bid
COMMITMENT=$(echo -n "live-test-$(date +%s)" | sha256sum | awk '{print "0x" $1}')
echo "  Submitting bid with commitment $COMMITMENT..."
TX=$(cast send $VAULT "submitOrder(uint8,bytes32,uint256,uint256,uint256,uint256)" \
  0 $COMMITMENT 0 1000000000 2500000 $(($(date +%s) + 3600)) \
  --rpc-url $RPC --private-key $PRIVATE_KEY 2>&1)
echo "$TX" | grep "status" | head -1
TXHASH=$(echo "$TX" | grep "transactionHash" | awk '{print $2}')
echo "  ✓ submitOrder tx: $TXHASH"
echo "  View on explorer: https://coston2-explorer.flare.network/tx/$TXHASH"

echo ""
echo "=== Step 4: Test live-mode via live URL ==="
LIVE_URL=https://whisper-frontend-pm7d.onrender.com
echo "  /api/tee/status..."
status=$(curl -s $LIVE_URL/api/tee/status)
live_mode=$(echo "$status" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('live_mode', False))")
echo "  live_mode: $live_mode"
if [ "$live_mode" != "True" ]; then
  echo "  WARNING: live_mode is not True. Check env vars."
  exit 1
fi
echo "  ✓ Live mode is ON"

echo ""
echo "=== All checks passed! ==="
echo "Live demo URL: $LIVE_URL"
echo "Coston2 vault: https://coston2-explorer.flare.network/address/$VAULT"
echo "Last submitOrder tx: https://coston2-explorer.flare.network/tx/$TXHASH"
