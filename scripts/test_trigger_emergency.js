/*
Quick test script to trigger an emergency via your local Supabase Function.
Run with:

SUPABASE_URL="https://xyz.supabase.co" SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" node scripts/test_trigger_emergency.js

This will POST to the function endpoint and print the response.
*/

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment');
  process.exit(1);
}

(async () => {
  const url = `${SUPABASE_URL}/functions/v1/trigger-emergency`;
  const payload = {
    // Replace with a valid user id from your Supabase `profiles` table, or set EMERGENCY_SERVICE_USER_ID
    user_id: process.env.EMERGENCY_SERVICE_USER_ID || null,
    latitude: process.env.TEST_LATITUDE ? Number(process.env.TEST_LATITUDE) : 12.9716,
    longitude: process.env.TEST_LONGITUDE ? Number(process.env.TEST_LONGITUDE) : 77.5946,
    alert_type: 'manual',
    notes: 'Test trigger from local script',
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    console.log('Status:', res.status);
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Request failed:', err);
  }
})();