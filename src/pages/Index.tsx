import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Activity, Heart, LogOut, Settings, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useECGData } from "@/hooks/useECGData";
import { useLocation } from "@/hooks/useLocation";
import { useHospitals } from "@/hooks/useHospitals";
import AuthForm from "@/components/AuthForm";
import ECGMonitor from "@/components/ECGMonitor";
import HospitalMap from "@/components/HospitalMap";
import EmergencyContacts from "@/components/EmergencyContacts";
import AlertStatus from "@/components/AlertStatus";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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
  const { user, loading, signIn, signUp, signOut, signInWithGoogle } = useAuth();
  const { location, isLoading: locationLoading } = useLocation();
  const { readings, isConnected, heartRate, stElevationDetected } = useECGData(user?.id);
  const { hospitals, isLoading: hospitalsLoading } = useHospitals(
    location?.latitude,
    location?.longitude
  );

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [aiResult, setAiResult] = useState<string | null>(null);

  const analyzeECG = async () => {
  try {
    if (!readings || readings.length === 0) {
      setAiResult("No ECG data available to analyze yet. Please ensure your device is connected.");
      return;
    }

    const response = await fetch("http://localhost:8080/analyze-ecg", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        signal: readings,
        sampling_rate: 250,
      }),
    });

    if (!response.ok) {
      setAiResult("AI analysis service error. Please try again later.");
      return;
    }

    const data = await response.json();

    const summary =
      data?.summary || "Analysis completed, but no summary was returned.";
    const patterns = Array.isArray(data?.patterns)
      ? data.patterns.join(", ")
      : "No specific patterns returned.";
    const risk = data?.risk_level
      ? `Risk level: ${data.risk_level.toUpperCase()}`
      : "";

    setAiResult(
      `${summary}\nPatterns: ${patterns}${risk ? `\n${risk}` : ""}`
    );
  } catch (error) {
    console.error("AI ECG analysis failed:", error);
    setAiResult(
      "Failed to analyze ECG. Please check your connection or try again later."
    );
  }
};
  const fetchContacts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("emergency_contacts")
      .select("*")
      .eq("user_id", user.id)
      .order("priority");
    if (data) setContacts(data);
  };


  const fetchAlerts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("emergency_alerts")
      .select("*")
      .eq("user_id", user.id)
      .order("triggered_at", { ascending: false })
      .limit(10);
    if (data) setAlerts(data);
  };

  useEffect(() => {
    if (user) {
      fetchContacts();
      fetchAlerts();
    }
  }, [user]);

  // Subscribe to realtime alerts
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("alerts-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "emergency_alerts",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthForm
        onSignIn={signIn}
        onSignUp={signUp}
        onGoogle={signInWithGoogle}
      />
    );
  }

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
              onClick={async () => {
                try {
                  if (!("serial" in navigator)) {
                    alert("WebSerial is not supported in this browser. Please use Chrome.");
                    return;
                  }

                  const port = await navigator.serial.requestPort();
                  await port.open({ baudRate: 9600 });

                  const reader = port.readable.getReader();
                  alert("Arduino Connected!");

                  // Optional serial listener
                  const { value, done } = await reader.read();
                  if (!done && value) {
                    console.log(new TextDecoder().decode(value));
                  }
                } catch (err) {
                  console.error("Arduino connection failed:", err);
                  alert("Failed to connect to Arduino.");
                }
              }}
            >
              Connect Arduino
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-5 w-5" />
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
                <Button
                  onClick={analyzeECG}
                  className="w-full"
                >
                  Analyze ECG
                </Button>

                {aiResult && (
                  <div className="p-3 rounded-md bg-muted text-sm">
                    {aiResult}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  This is an automated pattern analysis for educational purposes only and is NOT a medical diagnosis.
                </p>
              </CardContent>
            </Card>
            <HospitalMap
              hospitals={hospitals}
              userLocation={location}
              isLoading={locationLoading || hospitalsLoading}
            />
            <EmergencyContacts
              contacts={contacts}
              onContactsChange={fetchContacts}
              userId={user.id}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
