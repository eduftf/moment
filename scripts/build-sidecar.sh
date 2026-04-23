#!/usr/bin/env bash
set -euo pipefail

# Build the Swift AI sidecar binary and place it where Tauri expects.
# Ad-hoc codesigns so local macOS allows it to run without Gatekeeper
# friction on the developer's own Mac.

SIDECAR_DIR="$(cd "$(dirname "$0")/.." && pwd)/sidecar"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/binaries"
TRIPLE="$(rustc -Vv | awk '/host/ {print $2}')"
# Tauri expects the binary named with the target triple suffix.
OUT_BIN="${OUT_DIR}/moment-ai-sidecar-${TRIPLE}"

mkdir -p "${OUT_DIR}"

pushd "${SIDECAR_DIR}" > /dev/null
swift build -c release
BUILT="${SIDECAR_DIR}/.build/release/MomentAISidecar"
if [ ! -x "${BUILT}" ]; then
    echo "[build-sidecar] expected release binary at ${BUILT} — swift build failed"
    exit 1
fi
cp "${BUILT}" "${OUT_BIN}"
codesign --force --deep -s - "${OUT_BIN}"
popd > /dev/null

echo "[build-sidecar] sidecar ready at ${OUT_BIN}"
