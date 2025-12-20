#!/usr/bin/env bash
# Apply notification setup:
# - Sets Supabase secrets for any notification-related env vars present
# - Optionally runs migrations (if supabase CLI is available)
# - Deploys functions (if supabase CLI is available)
# - Adds emergency contact if EMERGENCY_CONTACT_PHONE & EMERGENCY_SERVICE_USER_ID present

set -euo pipefail

# Collect secrets we can set (only set those that are present in environment)
declare -a kv=()
maybe_add() {
  local k=$1
  local v=${!k:-}
  if [ -n "$v" ]; then
    kv+=("$k=$v")
  fi
}

maybe_add TWILIO_ACCOUNT_SID
maybe_add TWILIO_AUTH_TOKEN
maybe_add TWILIO_PHONE_NUMBER
maybe_add EMAILJS_SERVICE_ID
maybe_add EMAILJS_TEMPLATE_ID
maybe_add EMAILJS_USER_ID
maybe_add EMERGENCY_SERVICE_USER_ID

if command -v supabase >/dev/null 2>&1; then
  if [ ${#kv[@]} -gt 0 ]; then
    echo "Setting Supabase secrets for: ${kv[*]}"
    supabase secrets set ${kv[*]}
  else
    echo "No notification secrets found in environment; skipping supabase secrets set."
  fi

  # Apply DB migrations if any (don't fail the whole script if push fails)
  if [ -f "supabase/migrations/20251217_add_alert_fields.sql" ]; then
    echo "Applying DB migrations (supabase db push)"
    if ! supabase db push; then
      echo "supabase db push failed (CLI may not be linked to a project)."
      echo "You can run 'supabase db push --debug' or apply the SQL manually in the Supabase SQL editor. Continuing..."
    fi
  fi

  # Deploy functions (don't fail on deploy errors)
  echo "Deploying functions (trigger-emergency, emergency-alert)"
  supabase functions deploy trigger-emergency || echo "trigger-emergency deploy failed; continue."
  supabase functions deploy emergency-alert || echo "emergency-alert deploy failed; continue."
else
  echo "supabase CLI not found: will not set secrets or deploy. Install CLI or run the exact commands yourself."
  echo "If you want to set secrets now, run (fill placeholders as needed):"
  echo "  supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_PHONE_NUMBER=... EMAILJS_SERVICE_ID=... EMAILJS_TEMPLATE_ID=... EMAILJS_USER_ID=... EMERGENCY_SERVICE_USER_ID=..."
fi

# Add emergency contact if details are present
if [ -n "${EMERGENCY_CONTACT_PHONE:-}" ] && [ -n "${EMERGENCY_SERVICE_USER_ID:-}" ] && [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Adding emergency contact via REST"
  EMERGENCY_CONTACT_NAME=${EMERGENCY_CONTACT_NAME:-"Self (Primary)"}
  EMERGENCY_CONTACT_RELATIONSHIP=${EMERGENCY_CONTACT_RELATIONSHIP:-"Owner"}
  EMERGENCY_CONTACT_PRIORITY=${EMERGENCY_CONTACT_PRIORITY:-1}

  # Decide how to pretty-print response: use jq if available, else cat
  if command -v jq >/dev/null 2>&1; then
    _JQ_CMD="jq -r"
  else
    _JQ_CMD="cat"
  fi

  # POST the contact but don't let HTTP errors abort the whole script; capture response & status
  resp=$(curl -sS -w "\n%{http_code}" -X POST "${SUPABASE_URL}/rest/v1/emergency_contacts" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "{\"user_id\": \"${EMERGENCY_SERVICE_USER_ID}\",\"name\": \"${EMERGENCY_CONTACT_NAME}\",\"phone_number\": \"${EMERGENCY_CONTACT_PHONE}\",\"relationship\": \"${EMERGENCY_CONTACT_RELATIONSHIP}\",\"priority\": ${EMERGENCY_CONTACT_PRIORITY}}") || true
  # split body and http code
  http_code=$(printf "%s" "$resp" | tail -n1)
  body=$(printf "%s" "$resp" | sed '
$ d')

  echo "HTTP status: $http_code"
  printf "%s\n" "$body" | eval "$_JQ_CMD"

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo "Emergency contact added successfully."
  else
    echo "Failed to add emergency contact via REST (status $http_code)."
    echo "This commonly happens if the table is not exposed to PostgREST (schema cache error)."
    echo "As a fallback you can run the following SQL in the Supabase SQL editor to add the contact manually:"
    echo
    cat <<'SQL'
-- Replace the values in angle brackets and run in Supabase SQL editor
INSERT INTO public.profiles (id, phone) VALUES ('<EMERGENCY_SERVICE_USER_ID>', '<EMERGENCY_CONTACT_PHONE>')
ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone;

INSERT INTO public.emergency_contacts (user_id, name, phone_number, relationship, priority)
VALUES ('<EMERGENCY_SERVICE_USER_ID>', '<EMERGENCY_CONTACT_NAME>', '<EMERGENCY_CONTACT_PHONE>', '<EMERGENCY_CONTACT_RELATIONSHIP>', <EMERGENCY_CONTACT_PRIORITY>);
SQL
    echo
    echo "Alternatively, re-run this script after applying migrations / ensuring the table is exposed to PostgREST."
  fi
else
  echo "Insufficient env to automatically add emergency contact. To add manually, run:"
  echo
  echo "  EMERGENCY_CONTACT_PHONE=+918700522874 EMERGENCY_SERVICE_USER_ID=your-user-uuid SUPABASE_URL=https://<your>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> ./scripts/add_emergency_contact.sh"
  echo
fi

# Final note
echo "Done. Check Supabase UI for entries in emergency_contacts, emergency_alerts, and alert_notifications."
