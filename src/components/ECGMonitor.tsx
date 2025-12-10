import { useEffect, useState, useRef } from "react";
import emailjs from "@emailjs/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Heart, AlertTriangle } from "lucide-react";
import useECGStream from "@/hooks/useECGStream";

interface ECGReading {
  reading_value: number;
  heart_rate?: number;
  st_elevation_detected: boolean;
  reading_timestamp: string;
}

interface ECGMonitorProps {
  readings: ECGReading[];
  isConnected: boolean;
  heartRate?: number;
  stElevationDetected?: boolean;
}

const ECGMonitor = ({
  readings,
  isConnected,
  heartRate,
  stElevationDetected,
}: ECGMonitorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displayReadings, setDisplayReadings] = useState<number[]>([]);
  const [location, setLocation] = useState<{ lat: number | null; lon: number | null }>({
    lat: null,
    lon: null,
  });

  const ecgVal = useECGStream();

  // ✅ FIXED — Hooks MUST be inside component
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      });
    }
  }, []);

  const handleTestAlert = async () => {
    try {
      const { lat, lon } = location;

      const googleMapsLink =
        lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : "Location unavailable";

      const osmLink =
        lat && lon
          ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`
          : "Location unavailable";

      await emailjs.send(
        "service_dehwim4",
        "template_rifct2b",
        {
          type: "TEST ALERT",
          message: "A test alert has been triggered.",
          latitude: lat,
          longitude: lon,
          google_map: googleMapsLink,
          osm_map: osmLink,
        },
        "RbN4Qs2il-qWu_Pcq"
      );

      alert("✔ Test alert email sent with GPS!");
    } catch (err) {
      console.error("EmailJS error:", err);
      alert("❌ Failed to send email.");
    }
  };

  // Keep last 200 readings for display
  useEffect(() => {
    const values = readings.slice(-200).map((r) => r.reading_value);
    setDisplayReadings(values);
  }, [readings]);

  useEffect(() => {
    if (ecgVal !== null && ecgVal !== undefined) {
      setDisplayReadings((prev) => [...prev.slice(-199), ecgVal]);
    }
  }, [ecgVal]);

  // DRAW ECG GRAPH
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = "hsl(215, 35%, 8%)";
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = "hsl(215, 25%, 20%)";
    ctx.lineWidth = 0.5;

    for (let x = 0; x < width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // ECG Line
    if (displayReadings.length > 1) {
      ctx.strokeStyle = stElevationDetected ? "hsl(0, 85%, 55%)" : "hsl(142, 70%, 55%)";
      ctx.lineWidth = 2;
      ctx.beginPath();

      const xStep = width / 200;
      const midY = height / 2;
      const scale = height / 4;

      displayReadings.forEach((value, index) => {
        const x = index * xStep;
        const baseline = 340;
        const gain = 40;
        const normalized = (value - baseline) / gain;
        const y = midY - normalized * scale;

        index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });

      ctx.stroke();
    }

    // Scan line
    if (displayReadings.length > 0) {
      const scanX = (displayReadings.length % 200) * (width / 200);
      ctx.fillStyle = "rgba(142, 200, 150, 0.3)";
      ctx.fillRect(scanX, 0, 3, height);
    }
  }, [displayReadings, stElevationDetected]);

  return (
    <Card className="bg-card border-border glass soft-shadow hover-lift transition-all">
      <CardHeader className="pb-2 fade-in">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-foreground gradient-text">
            <Activity className="h-5 w-5 text-ecg-line" />
            ECG Monitor
          </CardTitle>

          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? "default" : "secondary"} className={isConnected ? "bg-success" : ""}>
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>

            {stElevationDetected && (
              <Badge variant="destructive" className="bg-emergency emergency-pulse">
                <AlertTriangle className="h-3 w-3 mr-1" />
                ST Elevation
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <canvas
          ref={canvasRef}
          width={800}
          height={200}
          className="w-full h-48 rounded-lg border border-ecg-grid soft-shadow fade-in"
        />

        {heartRate && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-ecg-background/90 px-3 py-1 rounded-md soft-shadow transition-all">
            <Heart className="h-4 w-4 text-emergency animate-pulse" />
            <span className="text-ecg-line font-mono font-bold">{heartRate}</span>
            <span className="text-muted-foreground text-sm">BPM</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-2">Real-time ECG via Arduino</p>

        <button
          onClick={handleTestAlert}
          style={{
            padding: "10px 16px",
            background: "red",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "16px",
            cursor: "pointer",
            marginTop: "12px",
          }}
        >
          🚨 Test Emergency Alert
        </button>
      </CardContent>
    </Card>
  );
};

export default ECGMonitor;