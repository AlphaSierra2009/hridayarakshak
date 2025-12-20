# Notifications setup 🔔

To enable emergency notifications (Twilio SMS/WhatsApp and EmailJS email), set the following environment variables for your Supabase Functions and local development (do **NOT** commit these to git):

- TWILIO_ACCOUNT_SID — your Twilio Account SID
- TWILIO_AUTH_TOKEN — your Twilio Auth Token
- TWILIO_PHONE_NUMBER — Twilio phone number for SMS (e.g. +14155551234)
- TWILIO_WHATSAPP_NUMBER — Twilio WhatsApp-enabled number (e.g. whatsapp:+14155551234)
- EMAILJS_SERVICE_ID — your EmailJS service id (e.g. service_xxx)
- EMAILJS_TEMPLATE_ID — your EmailJS template id (e.g. template_xxx)
- EMAILJS_USER_ID — your EmailJS public key (user_xxx)

How to set them in Supabase (recommended):

1. Open your Supabase project dashboard.
2. Go to **Functions** -> **Settings** -> **Environment Variables** (or **Configuration** for older UI).
3. Add key/value pairs for the variables listed above.
4. Re-deploy or restart your function if required.

How to set locally (for testing):

- Create a `.env.local` (or similar) and load these variables in your dev environment. Example with supabase CLI:

```bash
# set with supabase CLI
supabase secrets set TWILIO_ACCOUNT_SID="<your-sid>" TWILIO_AUTH_TOKEN="<your-token>" TWILIO_PHONE_NUMBER="+1415..." TWILIO_WHATSAPP_NUMBER="whatsapp:+1415..." EMAILJS_SERVICE_ID="service_xxx" EMAILJS_TEMPLATE_ID="template_xxx" EMAILJS_USER_ID="user_xxx"
```

Notes & security

- Keep your tokens secret. Do not commit them to source control.
- Phone numbers should be E.164 formatted (include country code).
- EmailJS requires a public key (user ID) and a template; ensure the template includes `{{to_name}}` or other template parameters you expect.
- The `supabase/functions/emergency-alert` function logs delivery attempts to the `alert_notifications` table so you can audit what was sent and whether delivery succeeded.

If you'd like I can add a small admin page in the UI to display recent `alert_notifications` and retry failures. Let me know if you want that next.

---

Automated setup scripts

- `scripts/apply_notifications_setup.sh` — safe helper that will set Supabase secrets (if the `supabase` CLI is available and env vars are present), push the DB migration, deploy the two notification-related functions, and optionally insert an emergency contact using the service role key if `EMERGENCY_CONTACT_PHONE` and `EMERGENCY_SERVICE_USER_ID` are present in the environment.

- `scripts/add_emergency_contact.sh` — standalone helper to insert an emergency contact via the Supabase REST API when you have `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EMERGENCY_CONTACT_PHONE`, and `EMERGENCY_SERVICE_USER_ID` available.

Usage examples

1) If you already exported vars in your shell, run the automated script:

```bash
# export required env vars first (do not commit):
# export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... EMERGENCY_SERVICE_USER_ID=... EMERGENCY_CONTACT_PHONE=+918700522874
./scripts/apply_notifications_setup.sh
```

2) Or add contact explicitly:

```bash
SUPABASE_URL="https://<your>.supabase.co" SUPABASE_SERVICE_ROLE_KEY="<service-key>" EMERGENCY_CONTACT_PHONE="+918700522874" EMERGENCY_SERVICE_USER_ID="<uuid>" ./scripts/add_emergency_contact.sh
```

These scripts are safe: they do not store secrets in the repo and only run actions when you provide the necessary env vars locally.