import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Activity, Heart, Settings, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useECGData } from "@/hooks/useECGData";
import { useLocation } from "@/hooks/useLocation";
import NearestHospital from "@/components/NearestHospital";
import HospitalMap from "@/components/HospitalMap";
import { useNearestHospital } from "@/hooks/useNearestHospital";
import EmergencyContacts from "@/components/EmergencyContacts";
import AlertStatus from "@/components/AlertStatus";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import useECGStream from "@/hooks/useECGStream";

import ECGMonitor from "@/components/ECGMonitor";

interface Contact {
  id: string;
  name: string;
  phone_number: string;
  relationship?: string;
  priority: number;
}

interface Alert {
  id: string;
  alert_type: string;
  status: string;
  triggered_at: string;
  latitude?: number;
  longitude?: number;
}

const Index = () => {
  // no auth now — keep ECG and location hooks working
  const { location, isLoading: locationLoading } = useLocation();
  const { readings, isConnected, heartRate, stElevationDetected } = useECGData();
  const { hospitals, loading: hospitalsLoading } = useNearestHospital(location);
  const { connected, connect } = useECGStream();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [aiResult, setAiResult] = useState<string | null>(null);

  const ANALYSIS_URL = import.meta.env.VITE_ANALYSIS_URL || "http://localhost:54321/functions/v1/analyze-ecg";
  const [analyzing, setAnalyzing] = useState(false);

  const analyzeECG = async () => {
    try {
      if (!readings || readings.length === 0) {
        setAiResult("No ECG data available to analyze yet. Please ensure your device is connected.");
        return;
      }

      setAnalyzing(true);

      // extract numeric values from readings (support both raw array and objects)
      const signal = readings.map((r: any) => (typeof r === "number" ? r : r.reading_value ?? 0));

      const response = await fetch(ANALYSIS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signal,
          sampling_rate: 250,
        }),
      });

      setAnalyzing(false);

      if (!response.ok) {
        setAiResult("AI analysis service error. Please try again later.");
        return;
      }

      const data = await response.json();

      const summary = data?.summary || "Analysis completed, but no summary was returned.";
      const patterns = Array.isArray(data?.patterns) ? data.patterns.join(", ") : "No specific patterns returned.";
      const risk = data?.risk_level ? `Risk level: ${data.risk_level.toUpperCase()}` : "";

      setAiResult(`${summary}\nPatterns: ${patterns}${risk ? `\n${risk}` : ""}`);
    } catch (error) {
      console.error("AI ECG analysis failed:", error);
      setAnalyzing(false);
      setAiResult("Failed to analyze ECG. Please check your connection or try again later.");
    }
  };

  // fetch public contacts (no user filter)
  const fetchContacts = async () => {
    const { data } = await supabase
      .from("emergency_contacts")
      .select("*")
      .order("priority");
    if (data) setContacts(data);
  };

  // fetch latest alerts (no user filter)
  const fetchAlerts = async () => {
    const { data } = await supabase
      .from("emergency_alerts")
      .select("*")
      .order("triggered_at", { ascending: false })
      .limit(10);
    if (data) setAlerts(data);
  };

  useEffect(() => {
    fetchContacts();
    fetchAlerts();
  }, []);

  // Realtime subscription for all alerts (no user filter)
  useEffect(() => {
    const channel = supabase
      .channel("alerts-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "emergency_alerts",
        },
        (payload: any) => {
          // Refresh list
          fetchAlerts();

          // On INSERT show browser notification
          try {
            if (payload?.eventType === 'INSERT' || payload?.eventType === 'insert' || payload?.type === 'INSERT') {
              const rec = payload?.new || payload?.record || payload?.new_record || null;
              const st = rec?.stemi_level ?? rec?.stemi ?? null;
              const msg = rec ? `${rec.alert_type} — ST% ${st ?? '--'}` : 'New emergency alert';
              if (typeof Notification !== 'undefined') {
                if (Notification.permission === 'granted') new Notification('Emergency Alert', { body: msg });
                else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p === 'granted') new Notification('Emergency Alert', { body: msg }); });
              }
            }
          } catch (nErr) { console.warn('Realtime notification failed', nErr); }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background page-transition">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50 soft-shadow hover-lift transition-all">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Heart className="h-8 w-8 text-emergency" />
              <Activity className="h-5 w-5 text-ecg-line absolute -bottom-1 -right-1" />
            </div>
            <div>
              <h1 className="font-bold text-foreground">हृदय रक्षक</h1>
              <p className="text-xs text-muted-foreground">ECG Monitoring System</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stElevationDetected && (
              <Button variant="destructive" size="sm" className="emergency-pulse">
                <Bell className="h-4 w-4 mr-1" />
                Emergency Active
              </Button>
            )}
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
            <Button
              variant="default"
              size="sm"
              className="soft-shadow hover-lift transition-all"
              onClick={() => connect()}
              disabled={connected}
            >
              {connected ? "Arduino Connected" : "Connect Arduino"}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            <ECGMonitor
              readings={readings}
              isConnected={isConnected}
              heartRate={heartRate}
              stElevationDetected={stElevationDetected}
            />
            <AlertStatus alerts={alerts} onAlertsChange={fetchAlerts} />
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <Card className="soft-shadow hover-lift transition-all">
              <CardHeader>
                <CardTitle>AI ECG Analysis (Beta)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={analyzeECG} className="w-full" disabled={analyzing}>
                  {analyzing ? "Analyzing…" : "Analyze ECG"}
                </Button>

                {aiResult && (
                  <div className="p-3 rounded-md bg-muted text-sm whitespace-pre-line">
                    {aiResult}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  This is an automated pattern analysis for educational purposes only. NOT a medical diagnosis.
                </p>
              </CardContent>
            </Card>

            <NearestHospital location={location} />
            <HospitalMap
              hospitals={hospitals.map((h, idx) => ({
                id: h.name ? `${h.name}-${idx}` : String(idx),
                name: h.name,
                address: h.address || "",
                phone: h.phone || "",
                latitude: h.latitude,
                longitude: h.longitude,
                distance_km: Number((h.distance || 0).toFixed(2)),
              }))}
              userLocation={location}
              isLoading={locationLoading || hospitalsLoading}
            />
            <EmergencyContacts
              contacts={contacts}
              onContactsChange={fetchContacts}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;