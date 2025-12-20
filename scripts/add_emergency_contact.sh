#!/usr/bin/env bash
# Adds an emergency contact to your Supabase project via REST.
# Requires (exported in env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMERGENCY_CONTACT_PHONE, EMERGENCY_SERVICE_USER_ID
# Example:
# SUPABASE_URL="https://<your>.supabase.co" SUPABASE_SERVICE_ROLE_KEY="<key>" EMERGENCY_CONTACT_PHONE="+918700522874" EMERGENCY_SERVICE_USER_ID="<uuid>" ./scripts/add_emergency_contact.sh

set -euo pipefail

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment"
  exit 1
fi

PHONE=${EMERGENCY_CONTACT_PHONE:-}
USER_ID=${EMERGENCY_SERVICE_USER_ID:-}
NAME=${EMERGENCY_CONTACT_NAME:-"Self (Primary)"}
REL=${EMERGENCY_CONTACT_RELATIONSHIP:-"Owner"}
PRIORITY=${EMERGENCY_CONTACT_PRIORITY:-1}

if [ -z "$PHONE" ] || [ -z "$USER_ID" ]; then
  echo "Error: EMERGENCY_CONTACT_PHONE and EMERGENCY_SERVICE_USER_ID must be set in the environment"
  echo "Example: EMERGENCY_CONTACT_PHONE=+918700522874 EMERGENCY_SERVICE_USER_ID=<uuid> ./scripts/add_emergency_contact.sh"
  exit 1
fi

echo "Adding emergency contact for user: $USER_ID phone: $PHONE"

resp=$(curl -s -w "\n%{http_code}" -X POST "${SUPABASE_URL}/rest/v1/emergency_contacts" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"user_id\": \"${USER_ID}\", \"name\": \"${NAME}\", \"phone_number\": \"${PHONE}\", \"relationship\": \"${REL}\", \"priority\": ${PRIORITY}}")

body=$(echo "$resp" | sed '$d')
code=$(echo "$resp" | tail -n 1)

if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
  echo "Contact added successfully:"
  echo "$body" | jq -r
else
  echo "Failed to add contact (HTTP $code):"
  echo "$body"
  exit 1
fi
