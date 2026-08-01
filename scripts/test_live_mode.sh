#!/usr/bin/env bash
# Full live-mode end-to-end test against deployed Coston2 contracts
# Run AFTER setting Render env vars and Manual Deploying
set -e
export PATH="$HOME/.foundry/bin:$PATH"

PRIVATE_KEY=0xf35d4bdf9f3822b62b752545f22de0d094e91fda37cd875804ccbc51629eff87
VAULT=0x8Aa32cA2AFc5C9E8173D882C1Efd72587e60ba33
TEE_VERIFIER=0x9FF9b136A7321EDDA152706df4458d69E7C9F3d9
FXRP=0x4c765bac23F792b3954fEF6A8E22fb87634cEdCa
SETTLE=0xBc910dbE4ad4155AaAd651421f95d7A494660071
RPC=https://coston2-api.flare.network/ext/C/rpc
TEE_SK=0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff
TEE_ID=0x2222222222222222222222222222222222222222222222222222222222222222
TEE_MEASUREMENT=0xbb1043ba0997b5258b4096d8427186f6bf5f6e85c640dfc98b4986ed2565eb0a

echo "=== Step 1: Verify contracts deployed ==="
for addr in $VAULT $TEE_VERIFIER $FXRP $SETTLE; do
  code=$(cast code $addr --rpc-url $RPC)
  if [ "$code" = "0x" ]; then
    echo "  ERROR: $addr has no code"
    exit 1
  else
    echo "  ✓ $addr (${#code} chars)"
  fi
done

echo ""
echo "=== Step 2: Verify TEE registered on-chain ==="
registered=$(cast call $TEE_VERIFIER "registeredTEEs(bytes32)(bool)" $TEE_ID --rpc-url $RPC 2>&1)
if [[ ! "$registered" == *"true"* ]]; then
  echo "  ERROR: TEE not registered"
  exit 1
fi
echo "  ✓ TEE registered"

echo ""
echo "=== Step 3: Approve + submit a fresh bid order ==="
cast send $FXRP "approve(address,uint256)" $VAULT 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
  --rpc-url $RPC --private-key $PRIVATE_KEY 2>&1 | grep "status" | head -1
COMMITMENT_BID=$(echo -n "test-bid-$(date +%s)" | sha256sum | awk '{print "0x" $1}')
echo "  commitment: $COMMITMENT_BID"
BID_TX=$(cast send $VAULT "submitOrder(uint8,bytes32,uint256,uint256,uint256,uint256)" \
  0 $COMMITMENT_BID 0 1000000000 2500000 $(($(date +%s) + 3600)) \
  --rpc-url $RPC --private-key $PRIVATE_KEY --json | python3 -c "import json,sys; print(json.load(sys.stdin)['transactionHash'])")
echo "  ✓ bid tx: $BID_TX"
BID_ORDER_ID=$(curl -s -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionReceipt\",\"params\":[\"$BID_TX\"],\"id\":1}" \
  $RPC | python3 -c "
import json, sys
r = json.load(sys.stdin)['result']
for log in r.get('logs', []):
    if log['topics'][0] == '0xd85da0bf5a42708d9c63da40ac54e99f6a3d403c9bf48f76fd8fba9893492e00':
        print(log['topics'][1])
        break
")
echo "  bid orderId: $BID_ORDER_ID"

echo ""
echo "=== Step 4: Submit a fresh ask order ==="
COMMITMENT_ASK=$(echo -n "test-ask-$(date +%s)" | sha256sum | awk '{print "0x" $1}')
ASK_TX=$(cast send $VAULT "submitOrder(uint8,bytes32,uint256,uint256,uint256,uint256)" \
  1 $COMMITMENT_ASK 2500000000 1000000000 2500000 $(($(date +%s) + 3600)) \
  --rpc-url $RPC --private-key $PRIVATE_KEY --json | python3 -c "import json,sys; print(json.load(sys.stdin)['transactionHash'])")
echo "  ✓ ask tx: $ASK_TX"
ASK_ORDER_ID=$(curl -s -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionReceipt\",\"params\":[\"$ASK_TX\"],\"id\":1}" \
  $RPC | python3 -c "
import json, sys
r = json.load(sys.stdin)['result']
for log in r.get('logs', []):
    if log['topics'][0] == '0xd85da0bf5a42708d9c63da40ac54e99f6a3d403c9bf48f76fd8fba9893492e00':
        print(log['topics'][1])
        break
")
echo "  ask orderId: $ASK_ORDER_ID"

echo ""
echo "=== Step 5: Build TEE attestation and call attestMatch ==="
. tee/.venv/bin/activate
MATCH_PARAMS=$(python3 << PYEOF
import json, time
from eth_keys import keys
from eth_utils import keccak

TEE_ID = bytes.fromhex("$TEE_ID"[2:])
TEE_MEASUREMENT = bytes.fromhex("$TEE_MEASUREMENT"[2:])
nonce = int(time.time())
inner = keccak(TEE_ID + nonce.to_bytes(32, 'big') + TEE_MEASUREMENT)
digest = keccak(b"\x19Ethereum Signed Message:\n32" + inner)
pk = keys.PrivateKey(bytes.fromhex("$TEE_SK"[2:]))
sig = pk.sign_msg_hash(digest)
v = sig.v + 27
att = TEE_ID + nonce.to_bytes(32, 'big') + sig.r.to_bytes(32, 'big') + sig.s.to_bytes(32, 'big') + v.to_bytes(1, 'big')
bid_id = "$BID_ORDER_ID"
ask_id = "$ASK_ORDER_ID"
match_id = keccak(bytes.fromhex(bid_id[2:]) + bytes.fromhex(ask_id[2:]) + (1000000000).to_bytes(32, 'big') + (2500000).to_bytes(32, 'big'))
print(json.dumps({
    "match_id": "0x" + match_id.hex(),
    "att": "0x" + att.hex(),
}))
PYEOF
)
MATCH_ID=$(echo "$MATCH_PARAMS" | python3 -c "import json,sys; print(json.load(sys.stdin)['match_id'])")
ATT=$(echo "$MATCH_PARAMS" | python3 -c "import json,sys; print(json.load(sys.stdin)['att'])")
echo "  matchId: $MATCH_ID"
MATCH_TX=$(cast send $VAULT "attestMatch(bytes32,bytes32,bytes32,uint256,uint256,bytes)" \
  $MATCH_ID $BID_ORDER_ID $ASK_ORDER_ID 1000000000 2500000 $ATT \
  --rpc-url $RPC --private-key $PRIVATE_KEY --json | python3 -c "import json,sys; print(json.load(sys.stdin)['transactionHash'])")
echo "  ✓ match tx: $MATCH_TX"
echo "  View: https://coston2-explorer.flare.network/tx/$MATCH_TX"

echo ""
echo "=== Step 6: Test live-mode via live URL ==="
LIVE_URL=https://whisper-frontend-pm7d.onrender.com
status=$(curl -s $LIVE_URL/api/tee/status)
live_mode=$(echo "$status" | python3 -c "import json,sys; print(json.load(sys.stdin).get('live_mode', False))" 2>/dev/null)
echo "  /api/tee/status live_mode: $live_mode"
if [ "$live_mode" != "True" ]; then
  echo "  WARNING: live_mode is not True. Set env vars in Render dashboard."
  echo "  See RENDER-ENV-VARS.md for the 10 env vars to add."
fi

echo ""
echo "=== All on-chain tests passed! ==="
echo "Latest match tx: https://coston2-explorer.flare.network/tx/$MATCH_TX"
