#!/usr/bin/env bash
# Usage: export TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_PHONE_NUMBER=... EMAILJS_SERVICE_ID=... && ./scripts/set_supabase_secrets.sh

set -euo pipefail

: "Ensure supabase CLI is installed and you're logged in (https://supabase.com/docs/guides/cli)"

secrets=(
  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
  TWILIO_PHONE_NUMBER
  TWILIO_WHATSAPP_NUMBER
  EMAILJS_SERVICE_ID
  EMAILJS_TEMPLATE_ID
  EMAILJS_USER_ID
  EMERGENCY_SERVICE_USER_ID
)

args=()
for k in "${secrets[@]}"; do
  val=${!k:-}
  if [ -n "$val" ]; then
    args+=("$k=$val")
  fi
done

if [ ${#args[@]} -eq 0 ]; then
  echo "No secrets found in environment. Set the variables and rerun."
  exit 1
fi

# Use supabase CLI to set secrets (this will store them securely in your project)
# You must be in the project directory or have SUPABASE_ACCESS_TOKEN set
supabase secrets set ${args[*]}

echo "Secrets set (only the keys present in env were applied)."
