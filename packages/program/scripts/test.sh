#!/usr/bin/env bash
# Build the SBF program and run every test against it. Run inside WSL (Anchor does not build
# on Windows):  wsl -e bash -l packages/program/scripts/test.sh  from the repo root in WSL.
#
# Targets live on the Linux side: building into /mnt/c is several times slower.
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/.."

CARGO_TARGET_DIR="$HOME/dev/.sporim-sbf" cargo build-sbf --manifest-path programs/sporim/Cargo.toml
export SPORIM_SO="$HOME/dev/.sporim-sbf/deploy/sporim.so"
CARGO_TARGET_DIR="$HOME/dev/.sporim-target" cargo test "$@"
