import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import useWirelessECG from "@/hooks/useWirelessECG";

import ECGMonitor from "@/components/ECGMonitor";
import useBLEECG from "@/hooks/useBLEECG";

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
  const navigate = useNavigate();
  // no auth now — keep ECG and location hooks working
  const { location, isLoading: locationLoading } = useLocation();
  const { readings, isConnected, heartRate, stElevationDetected } = useECGData();
  const enableBLE = (import.meta as any).env?.VITE_ENABLE_BLE === "true";
  const {
    connect: bleConnect,
    disconnect: bleDisconnect,
    connectionState: bleConnectionState,
    readings: bleReadings,
    isAvailable: bleAvailable,
  } = useBLEECG({});
  const { hospitals, loading: hospitalsLoading } = useNearestHospital(location);
  const { connected, connect } = useECGStream();
  const { state: espState, connect: connectESP, disconnect: disconnectESP } = useWirelessECG();

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
        console.warn("AI ECG analysis failed:", error);
      setAnalyzing(false);
      setAiResult("Failed to analyze ECG. Please check your connection or try again later.");
    }
  };

  // fetch public contacts (no user filter)
  const fetchContacts = async () => {
    try {
      const { data } = await supabase
        .from("emergency_contacts")
        .select("*")
        .order("priority");
      if (data) setContacts(data as Contact[]);
    } catch (err) {
      console.warn('fetchContacts failed (supabase)', err);
    }
  };

  // fetch latest alerts (no user filter)
  const fetchAlerts = async () => {
    try {
      const { data } = await supabase
        .from("emergency_alerts")
        .select("*")
        .order("triggered_at", { ascending: false })
        .limit(10);
      if (data) setAlerts(data as Alert[]);
    } catch (err) {
      console.warn('fetchAlerts failed (supabase)', err);
    }
  };

  useEffect(() => {
    fetchContacts();
    fetchAlerts();
  }, []);

  // Realtime subscription for all alerts (no user filter)
  useEffect(() => {
    try {
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
            // Refresh list — guard against errors so realtime failures don't break the page
            try {
              fetchAlerts();
            } catch (e) {
              console.warn('Realtime handler: fetchAlerts failed', e);
            }

            // On INSERT show browser notification (non-fatal)
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
        try {
          supabase.removeChannel(channel);
        } catch (e) {
          console.warn('Failed to remove supabase channel during cleanup', e);
        }
      };
    } catch (err) {
      // Non-fatal: supabase realtime unavailable; warn and continue
      console.warn('Realtime subscription failed to initialize (supabase)', err);
      return;
    }
  }, []);

  return (
    <div className="min-h-screen bg-background page-transition relative overflow-hidden">
      {/* Subtle background layer: soft vignette and faint ECG grid for clinical depth */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/30 to-background/70 mix-blend-overlay"></div>
        <svg className="absolute right-0 top-8 opacity-10 w-2/3 h-full" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0H0V20" fill="none" stroke="hsl(var(--ecg-grid))" stroke-width="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
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
            <Button
              variant="default"
              size="sm"
              className="soft-shadow hover-lift transition-all ml-2"
              onClick={async () => {
                if (espState === "connected") {
                  disconnectESP();
                  try { window.localStorage.removeItem('esp32:lastIP'); } catch {}
                  return;
                }

                // Try persisted IP, then mDNS, then prompt
                let ip = null;
                try { ip = window.localStorage.getItem('esp32:lastIP'); } catch {}

                if (!ip) {
                  // attempt mDNS-friendly local name first (may work on local networks with mDNS)
                  ip = 'esp32-ecg.local';
                  // attempt connect; if connection fails, the hook will handle reconnect/backoff — fall back to prompting
                  connectESP(ip);
                  // store provisional attempt; if it fails, user can retry
                  return;
                }

                connectESP(ip);
              }}
            >
              {espState === "connected" ? "ESP32 Connected" : espState === "connecting" ? "Connecting ESP32…" : "Connect ESP32"}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            <div className="space-y-3">
              {enableBLE && (
                <div className="p-3 rounded-md bg-muted/40 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">BLE ECG</div>
                    <div className="text-xs text-muted-foreground">{bleAvailable ? bleConnectionState : "Web Bluetooth unavailable"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {bleConnectionState !== "Connected" ? (
                      <Button size="sm" onClick={() => bleConnect()} disabled={!bleAvailable}>
                        Connect BLE
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive" onClick={() => bleDisconnect()}>
                        Disconnect BLE
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <ECGMonitor
                readings={bleReadings && bleReadings.length > 0 ? bleReadings : readings}
                isConnected={isConnected || bleConnectionState === "Connected"}
                heartRate={heartRate}
                stElevationDetected={stElevationDetected}
              />
            </div>
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