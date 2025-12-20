import { serve } from "https://deno.land/std/http/server.ts";
import twilio from "npm:twilio";

async function sendEmailAlert(payload: {
  to_email: string;
  subject: string;
  message: string;
}) {
  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID");
  const templateId = Deno.env.get("EMAILJS_TEMPLATE_ID");
  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY");

  if (!serviceId || !templateId || !publicKey) {
    console.warn("EmailJS env vars missing, skipping email");
    return;
  }

  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        to_email: payload.to_email,
        subject: payload.subject,
        message: payload.message,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("EmailJS failed:", text);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, message, is_test, email } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!accountSid || !authToken || !fromNumber) {
      return new Response(
        JSON.stringify({ error: "Twilio environment variables not set" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const client = twilio(accountSid, authToken);

    const sms = await client.messages.create({
      from: fromNumber,
      to: phone,
      body: message || "🚨 TEST EMERGENCY ALERT from Hridaya Rakshak",
    });

    if (email) {
      await sendEmailAlert({
        to_email: email,
        subject: is_test
          ? "TEST Emergency Alert"
          : "🚨 Emergency Alert – ECG Anomaly Detected",
        message:
          message ||
          "An abnormal ECG pattern was detected. Please take immediate action.",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        sid: sms.sid,
        test: !!is_test,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("SMS trigger error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
