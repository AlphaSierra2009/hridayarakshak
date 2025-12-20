import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertRequest {
  alert_id: string;
  user_id: string;
  latitude: number;
  longitude: number;
}

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Twilio env vars (set via Supabase project > Functions > Config or your deployment environment)
    // TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (SMS), TWILIO_WHATSAPP_NUMBER (e.g. whatsapp:+123456789)
    // EmailJS env vars: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_USER_ID (public key)
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { alert_id, user_id, latitude, longitude }: AlertRequest = await req.json();

    console.log("Processing emergency alert:", { alert_id, user_id, latitude, longitude });

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone_number")
      .eq("id", user_id)
      .single();

    // Get emergency contacts
    const { data: contacts } = await supabase
      .from("emergency_contacts")
      .select("*")
      .eq("user_id", user_id)
      .order("priority", { ascending: true });

    // Get all hospitals with ambulance service
    const { data: hospitals } = await supabase
      .from("hospitals")
      .select("*")
      .eq("has_ambulance", true)
      .eq("is_multi_facility", true);

    if (!hospitals || hospitals.length === 0) {
      console.log("No hospitals found in database");
      return new Response(
        JSON.stringify({ error: "No hospitals available" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate distances and find 5 nearest hospitals
    const hospitalsWithDistance = hospitals.map(hospital => ({
      ...hospital,
      distance: calculateDistance(latitude, longitude, hospital.latitude, hospital.longitude)
    }));

    hospitalsWithDistance.sort((a, b) => a.distance - b.distance);
    const nearestHospitals = hospitalsWithDistance.slice(0, 5);

    console.log("Nearest hospitals:", nearestHospitals.map(h => ({ name: h.name, distance: h.distance })));

    const locationUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    const emergencyMessage = `🚨 CARDIAC EMERGENCY ALERT 🚨
Patient: ${profile?.full_name || "Unknown"}
Phone: ${profile?.phone_number || "N/A"}
Status: ST Elevation Detected
Location: ${locationUrl}
Time: ${new Date().toISOString()}

IMMEDIATE MEDICAL ATTENTION REQUIRED`;

    const notifications: any[] = [];

    // Send notifications to hospitals
    for (const hospital of nearestHospitals) {
      const hospitalMessage = `${emergencyMessage}

Nearest Hospital: ${hospital.name}
Distance: ${hospital.distance.toFixed(2)} km
Address: ${hospital.address}`;

      console.log(`Notifying hospital: ${hospital.name}`);
      
      // Record notification attempt
      const { data: notification } = await supabase
        .from("alert_notifications")
        .insert({
          alert_id,
          recipient_type: "hospital",
          recipient_id: hospital.id,
          notification_method: "api",
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (notification) {
        notifications.push(notification);
      }

      // Optionally notify hospital via WhatsApp or EmailJS if configured
      try {
        if (twilioAccountSid && twilioAuthToken && twilioWhatsappNumber && hospital.phone_number) {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
          const waResp = await fetch(twilioUrl, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: `whatsapp:${hospital.phone_number}`,
              From: `whatsapp:${twilioWhatsappNumber}`,
              Body: hospitalMessage,
            }),
          });
          const waJson = await waResp.json();
          console.log(`Hospital WhatsApp sent to ${hospital.name}:`, waJson);

          await supabase.from("alert_notifications").insert({
            alert_id,
            recipient_type: "hospital",
            recipient_id: hospital.id,
            notification_method: "whatsapp",
            status: waResp.ok ? "delivered" : "failed",
            sent_at: new Date().toISOString(),
            delivered_at: waResp.ok ? new Date().toISOString() : null,
            error_message: waResp.ok ? null : JSON.stringify(waJson),
          });
        }

        if (emailjsServiceId && emailjsTemplateId && emailjsUserId && hospital.email) {
          const emailResp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              service_id: emailjsServiceId,
              template_id: emailjsTemplateId,
              user_id: emailjsUserId,
              template_params: {
                to_name: hospital.name,
                message: hospitalMessage,
                location: locationUrl,
                time: new Date().toISOString(),
                phone: hospital.phone_number || "N/A",
              },
            }),
          });
          const emailJson = await emailResp.json();
          console.log(`Hospital EmailJS sent to ${hospital.name}:`, emailJson);

          await supabase.from("alert_notifications").insert({
            alert_id,
            recipient_type: "hospital",
            recipient_id: hospital.id,
            notification_method: "email",
            status: emailResp.ok ? "sent" : "failed",
            sent_at: new Date().toISOString(),
            delivered_at: emailResp.ok ? new Date().toISOString() : null,
            error_message: emailResp.ok ? null : JSON.stringify(emailJson),
          });
        }
      } catch (notifyErr) {
        console.error(`Failed to notify hospital ${hospital.name} via secondary channels:`, notifyErr);
      }

      // In production, integrate with hospital API or emergency services
      // For now, we log the notification
      console.log(`Hospital notification sent to ${hospital.name}:`, hospitalMessage);
    }

    // Prepare EmailJS config (if available)
    const emailjsServiceId = Deno.env.get("EMAILJS_SERVICE_ID");
    const emailjsTemplateId = Deno.env.get("EMAILJS_TEMPLATE_ID");
    const emailjsUserId = Deno.env.get("EMAILJS_USER_ID");
    const twilioWhatsappNumber = Deno.env.get("TWILIO_WHATSAPP_NUMBER");

    // Send SMS / WhatsApp to emergency contacts if Twilio is configured
    if ((twilioAccountSid && twilioAuthToken && twilioPhoneNumber) && contacts && contacts.length > 0) {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      
      for (const contact of contacts) {
        try {
          const smsBody = `${emergencyMessage}\n\nContact: ${contact.name}\nRelationship: ${contact.relationship || "Emergency Contact"}`;

          // Send SMS
          const response = await fetch(twilioUrl, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: contact.phone_number,
              From: twilioPhoneNumber,
              Body: smsBody,
            }),
          });

          const result = await response.json();
          console.log(`SMS sent to ${contact.name}:`, result);

          // Record SMS notification
          await supabase
            .from("alert_notifications")
            .insert({
              alert_id,
              recipient_type: "contact",
              recipient_id: contact.id,
              notification_method: "sms",
              status: response.ok ? "delivered" : "failed",
              sent_at: new Date().toISOString(),
              delivered_at: response.ok ? new Date().toISOString() : null,
              error_message: response.ok ? null : JSON.stringify(result),
            });

          // Optionally also send WhatsApp if configured
          if (twilioWhatsappNumber && contact.phone_number) {
            try {
              const waResponse = await fetch(twilioUrl, {
                method: "POST",
                headers: {
                  "Authorization": `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  To: `whatsapp:${contact.phone_number}`,
                  From: `whatsapp:${twilioWhatsappNumber}`,
                  Body: smsBody,
                }),
              });
              const waResult = await waResponse.json();
              console.log(`WhatsApp sent to ${contact.name}:`, waResult);

              await supabase
                .from("alert_notifications")
                .insert({
                  alert_id,
                  recipient_type: "contact",
                  recipient_id: contact.id,
                  notification_method: "whatsapp",
                  status: waResponse.ok ? "delivered" : "failed",
                  sent_at: new Date().toISOString(),
                  delivered_at: waResponse.ok ? new Date().toISOString() : null,
                  error_message: waResponse.ok ? null : JSON.stringify(waResult),
                });
            } catch (waErr) {
              console.error(`Failed to send WhatsApp to ${contact.name}:`, waErr);
            }
          }

          // Send email via EmailJS if contact has email and EmailJS is configured
          if (emailjsServiceId && emailjsTemplateId && emailjsUserId && contact.email) {
            try {
              const emailResp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  service_id: emailjsServiceId,
                  template_id: emailjsTemplateId,
                  user_id: emailjsUserId,
                  template_params: {
                    to_name: contact.name,
                    message: emergencyMessage,
                    location: locationUrl,
                    time: new Date().toISOString(),
                    phone: profile?.phone_number || "N/A",
                  },
                }),
              });

              const emailResJson = await emailResp.json();
              console.log(`EmailJS sent to ${contact.name}:`, emailResJson);

              await supabase
                .from("alert_notifications")
                .insert({
                  alert_id,
                  recipient_type: "contact",
                  recipient_id: contact.id,
                  notification_method: "email",
                  status: emailResp.ok ? "sent" : "failed",
                  sent_at: new Date().toISOString(),
                  delivered_at: emailResp.ok ? new Date().toISOString() : null,
                  error_message: emailResp.ok ? null : JSON.stringify(emailResJson),
                });
            } catch (emailErr) {
              console.error(`Failed to send email to ${contact.name}:`, emailErr);
            }
          }

        } catch (smsError) {
          console.error(`Failed to send SMS to ${contact.name}:`, smsError);
        }
      }
    } else {
      console.log("Twilio not configured or no emergency contacts. SMS notifications skipped.");
      
      // Still record the contacts that would have been notified
      if (contacts && contacts.length > 0) {
        for (const contact of contacts) {
          await supabase
            .from("alert_notifications")
            .insert({
              alert_id,
              recipient_type: "contact",
              recipient_id: contact.id,
              notification_method: "sms",
              status: "pending_config",
              error_message: "Twilio not configured",
            });
        }
      }
    }

    // Update alert status
    await supabase
      .from("emergency_alerts")
      .update({ status: "notified" })
      .eq("id", alert_id);

    return new Response(
      JSON.stringify({
        success: true,
        alert_id,
        hospitals_notified: nearestHospitals.length,
        contacts_notified: contacts?.length || 0,
        nearest_hospitals: nearestHospitals.map(h => ({
          name: h.name,
          distance: h.distance.toFixed(2) + " km",
          phone: h.phone_number,
        })),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error processing emergency alert:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
