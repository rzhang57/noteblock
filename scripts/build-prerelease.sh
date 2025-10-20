#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/build-prerelease.sh
# Run from repo root.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Starting pre-release build from $REPO_ROOT"

# Build Go background service into noteblock-local-service/bin
SERVICE_DIR="noteblock-local-service"
BIN_DIR="$SERVICE_DIR/bin"
CMD_PATH="./cmd/noteblock"

mkdir -p "$BIN_DIR"

OS="$(uname -s)"
case "$OS" in
  Darwin)      BUILD_TARGET="$BIN_DIR/noteblock-server"; ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT) BUILD_TARGET="$BIN_DIR/noteblock-server.exe"; ;;
  Linux)       BUILD_TARGET="$BIN_DIR/noteblock-server"; ;;
  *)           echo "Unsupported OS: $OS"; exit 1; ;;
esac

echo "Building Go service for $OS -> $BUILD_TARGET"
pushd "$SERVICE_DIR" > /dev/null
# ensure modules
go mod tidy
go build -o "$BUILD_TARGET" "$CMD_PATH"
popd > /dev/null
echo "Go service built."

# Build frontend
echo "Building frontend (client)..."
pushd client > /dev/null
npm install
npm run build
popd > /dev/null
echo "Frontend built."

# Install electron dependencies at repo root (if package.json exists)
if [ -f package.json ]; then
  echo "Installing root npm deps..."
  npm install
else
  echo "No package.json at repo root; skipping root npm install."
fi

# Run electron-builder for the current OS
echo "Running electron-builder for $OS"
if [[ "$OS" == "Darwin" ]]; then
  npx electron-builder --mac
elif [[ "$OS" == "Linux" ]]; then
  npx electron-builder --linux
else
  # For Windows builds from non-Windows hosts electron-builder may still attempt cross-builds.
  npx electron-builder --win
fi

echo "Pre-release build complete."