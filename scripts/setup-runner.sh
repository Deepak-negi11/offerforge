#!/usr/bin/env bash
# Installs the C++ (gcc) and Java runtimes into a running Piston container.
set -euo pipefail
URL="${PISTON_URL:-http://localhost:2000}"
for pkg in '{"language":"gcc","version":"10.2.0"}' '{"language":"java","version":"15.0.2"}'; do
  echo "installing $pkg"
  curl -fsS -X POST "$URL/api/v2/packages" -H 'Content-Type: application/json' -d "$pkg"
  echo
done
curl -fsS "$URL/api/v2/runtimes"
