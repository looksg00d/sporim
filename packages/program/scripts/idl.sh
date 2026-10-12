#!/usr/bin/env bash
# Regenerate programs/sporim/idl.json. Run inside WSL.
#
# `anchor idl build` also "syncs keys": it rewrites declare_id! in lib.rs and the program id in
# Anchor.toml to whatever random keypair sits in the build's target dir. On 2026-09-24 that
# silently replaced the deployed id (EkfT…) with a fresh one. So both files are saved before
# and put back after, and the IDL's address is taken from the declare_id! we keep.
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/.."

LIB=programs/sporim/src/lib.rs
backup=$(mktemp -d)
cp "$LIB" "$backup/lib.rs"
cp Anchor.toml "$backup/Anchor.toml"
trap 'cp "$backup/lib.rs" "$LIB"; cp "$backup/Anchor.toml" Anchor.toml; rm -rf "$backup"' EXIT

CARGO_TARGET_DIR="$HOME/dev/.sporim-target" anchor idl build -p sporim -o "$backup/idl.json"

id=$(grep -oP 'declare_id!\("\K[^"]+' "$backup/lib.rs")
python3 - "$backup/idl.json" "$id" programs/sporim/idl.json <<'PY'
import json, sys
src, program_id, out = sys.argv[1:]
idl = json.load(open(src))
idl["address"] = program_id
open(out, "w").write(json.dumps(idl, indent=2, ensure_ascii=False) + "\n")
print(f"idl.json written for {program_id}: {[i['name'] for i in idl['instructions']]}")
PY
