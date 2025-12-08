import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TriggerRequest {
  user_id: string;
  latitude: number;
  longitude: number;
  alert_type?: string;
  notes?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, latitude, longitude, alert_type = "manual", notes }: TriggerRequest = await req.json();

    console.log("Manual emergency trigger:", { user_id, latitude, longitude, alert_type });

    // Create emergency alert
    const { data: alert, error: alertError } = await supabase
      .from("emergency_alerts")
      .insert({
        user_id,
        alert_type,
        status: "triggered",
        latitude,
        longitude,
        notes,
      })
      .select()
      .single();

    if (alertError) {
      console.error("Error creating alert:", alertError);
      return new Response(
        JSON.stringify({ error: "Failed to create alert" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call emergency alert function to notify hospitals and contacts
    const alertResponse = await fetch(`${supabaseUrl}/functions/v1/emergency-alert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        alert_id: alert.id,
        user_id,
        latitude,
        longitude,
      }),
    });

    const alertResult = await alertResponse.json();
    console.log("Emergency alert result:", alertResult);

    return new Response(
      JSON.stringify({
        success: true,
        alert_id: alert.id,
        ...alertResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error triggering emergency:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
