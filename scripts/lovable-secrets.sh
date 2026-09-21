#!/usr/bin/env bash
# Sets the DIBS SPV Factory secrets on a Lovable Cloud (Supabase) project.
#
# Usage:
#   SUPABASE_ACCESS_TOKEN=<token> scripts/lovable-secrets.sh <project-ref> [anon|service]
#
# <project-ref> is the subdomain of your project URL (https://<project-ref>.supabase.co).
# The second argument picks which key SPVFACTORY_API_KEY carries (default: anon).
# SPVFACTORY_TENANT_ID and SPVFACTORY_ENV are taken from supabase/functions/.env.example
# unless already exported in the environment.
set -euo pipefail

ref="${1:?project ref required}"
key_kind="${2:-anon}"
here="$(cd "$(dirname "$0")/.." && pwd)"
example="$here/supabase/functions/.env.example"

: "${SUPABASE_ACCESS_TOKEN:?export SUPABASE_ACCESS_TOKEN (Supabase account → Access Tokens)}"

read_example() { grep -E "^$1=" "$example" | head -1 | cut -d= -f2-; }

tenant="${SPVFACTORY_TENANT_ID:-$(read_example SPVFACTORY_TENANT_ID)}"
env_label="${SPVFACTORY_ENV:-$(read_example SPVFACTORY_ENV)}"
roles="${DIBS_FUNCTION_ALLOWED_ROLES:-$(read_example DIBS_FUNCTION_ALLOWED_ROLES)}"
cors="${DIBS_CORS_ORIGINS:-}"
base_url="https://${ref}.supabase.co/functions/v1"

echo "Linking project ${ref}…"
npx --yes supabase link --project-ref "$ref" >/dev/null

echo "Reading ${key_kind} key…"
keys_json="$(npx --yes supabase projects api-keys --project-ref "$ref" --output json)"
case "$key_kind" in
  anon)    api_key="$(printf '%s' "$keys_json" | python3 -c 'import json,sys;print(next(k["api_key"] for k in json.load(sys.stdin) if k["name"]=="anon"))')" ;;
  service) api_key="$(printf '%s' "$keys_json" | python3 -c 'import json,sys;print(next(k["api_key"] for k in json.load(sys.stdin) if k["name"]=="service_role"))')" ;;
  *) echo "second argument must be anon or service" >&2; exit 2 ;;
esac

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cat > "$tmp" <<ENV
SPVFACTORY_BASE_URL=${base_url}
SPVFACTORY_API_KEY=${api_key}
SPVFACTORY_TENANT_ID=${tenant}
SPVFACTORY_ENV=${env_label}
DIBS_FUNCTION_ALLOWED_ROLES=${roles}
ENV
[ -n "${DIBS_EIN_MONTHLY_CAP:-}" ] && echo "DIBS_EIN_MONTHLY_CAP=${DIBS_EIN_MONTHLY_CAP}" >> "$tmp"
[ -n "$cors" ] && echo "DIBS_CORS_ORIGINS=${cors}" >> "$tmp"

echo "Setting secrets on ${ref}…"
npx --yes supabase secrets set --project-ref "$ref" --env-file "$tmp"

echo
echo "Done. Verify with:"
echo "  curl -H 'Authorization: Bearer <user-jwt-or-service-key>' ${base_url}/factoryInfo"
