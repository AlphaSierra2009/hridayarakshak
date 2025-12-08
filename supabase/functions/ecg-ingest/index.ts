import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-token",
};

interface ECGData {
  reading_value: number;
  heart_rate?: number;
  latitude?: number;
  longitude?: number;
  device_token: string;
}

// Simple ST elevation detection algorithm
// In production, use a more sophisticated algorithm
function detectSTElevation(readings: number[]): boolean {
  if (readings.length < 10) return false;
  
  // Calculate baseline (average of first few readings)
  const baseline = readings.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  
  // Check for significant elevation (>0.2mV or 20% above baseline)
  const threshold = baseline * 1.2;
  const elevatedCount = readings.filter(r => r > threshold).length;
  
  // If more than 30% of readings are elevated, flag as potential ST elevation
  return elevatedCount > readings.length * 0.3;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { reading_value, heart_rate, latitude, longitude, device_token }: ECGData = await req.json();

    console.log("Received ECG data:", { reading_value, heart_rate, device_token });

    // Validate device token and get device info
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id, user_id, is_active")
      .eq("device_token", device_token)
      .single();

    if (deviceError || !device) {
      console.error("Device not found:", deviceError);
      return new Response(
        JSON.stringify({ error: "Invalid device token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!device.is_active) {
      return new Response(
        JSON.stringify({ error: "Device is inactive" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update device last seen
    await supabase
      .from("devices")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", device.id);

    // Get recent readings for ST elevation detection
    const { data: recentReadings } = await supabase
      .from("ecg_readings")
      .select("reading_value")
      .eq("device_id", device.id)
      .order("reading_timestamp", { ascending: false })
      .limit(20);

    const allReadings = recentReadings?.map(r => r.reading_value) || [];
    allReadings.unshift(reading_value);
    
    const stElevationDetected = detectSTElevation(allReadings);

    // Insert ECG reading
    const { data: reading, error: readingError } = await supabase
      .from("ecg_readings")
      .insert({
        device_id: device.id,
        user_id: device.user_id,
        reading_value,
        heart_rate,
        latitude,
        longitude,
        st_elevation_detected: stElevationDetected,
      })
      .select()
      .single();

    if (readingError) {
      console.error("Error inserting reading:", readingError);
      return new Response(
        JSON.stringify({ error: "Failed to save reading" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If ST elevation detected, trigger emergency alert
    if (stElevationDetected) {
      console.log("ST ELEVATION DETECTED! Triggering emergency alert...");
      
      // Create emergency alert
      const { data: alert, error: alertError } = await supabase
        .from("emergency_alerts")
        .insert({
          user_id: device.user_id,
          alert_type: "st_elevation",
          status: "triggered",
          latitude,
          longitude,
          ecg_reading_id: reading.id,
        })
        .select()
        .single();

      if (!alertError && alert) {
        // Call the emergency alert function
        const alertResponse = await fetch(`${supabaseUrl}/functions/v1/emergency-alert`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            alert_id: alert.id,
            user_id: device.user_id,
            latitude,
            longitude,
          }),
        });
        
        console.log("Emergency alert response:", await alertResponse.text());
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        reading_id: reading.id,
        st_elevation_detected: stElevationDetected,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error processing ECG data:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
