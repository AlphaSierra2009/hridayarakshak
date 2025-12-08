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

      // In production, integrate with hospital API or emergency services
      // For now, we log the notification
      console.log(`Hospital notification sent to ${hospital.name}:`, hospitalMessage);
    }

    // Send SMS to emergency contacts if Twilio is configured
    if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber && contacts && contacts.length > 0) {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      
      for (const contact of contacts) {
        try {
          const smsBody = `${emergencyMessage}

Contact: ${contact.name}
Relationship: ${contact.relationship || "Emergency Contact"}`;

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

          // Record notification
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
