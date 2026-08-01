#!/bin/bash
# Render build script for whisper-frontend.
# Builds the Next.js app, then exits cleanly. Render then runs `npm start`.

set -e
cd "$(dirname "$0")"

echo "==> Installing dependencies"
npm ci --no-audit --no-fund

echo "==> Building Next.js"
npm run build

echo "==> Build complete"
