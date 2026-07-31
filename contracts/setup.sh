#!/bin/bash
# Install Foundry library dependencies for Whisper contracts.
# Run this once after cloning the repo, before `forge build`.

set -e
cd "$(dirname "$0")/contracts"
mkdir -p lib

echo "==> Cloning forge-std..."
git clone --depth 1 https://github.com/foundry-rs/forge-std.git lib/forge-std

echo "==> Cloning OpenZeppelin..."
git clone --depth 1 https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts

echo "==> Cloning Flare periphery..."
git clone --depth 1 https://github.com/flare-foundation/flare-solidity-periphery-package-mirror.git lib/flare-periphery-contracts

echo "==> Cloning Flare vTPM attestation..."
git clone --depth 1 https://github.com/flare-foundation/flare-vtpm-attestation.git lib/flare-vtpm-attestation

echo ""
echo "✓ All deps installed. You can now run:"
echo "    cd contracts && forge build && forge test -vv"
