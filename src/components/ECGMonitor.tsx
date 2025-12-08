import { useEffect, useState, useRef } from "react";
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

const ECGMonitor = ({ readings, isConnected, heartRate, stElevationDetected }: ECGMonitorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displayReadings, setDisplayReadings] = useState<number[]>([]);
  const ecgVal = useECGStream();

  useEffect(() => {
    // Keep last 200 readings for display
    const values = readings.slice(-200).map((r) => r.reading_value);
    setDisplayReadings(values);
  }, [readings]);

  useEffect(() => {
    if (ecgVal !== null && ecgVal !== undefined) {
      setDisplayReadings((prev) => [...prev.slice(-199), ecgVal]);
    }
  }, [ecgVal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = "hsl(215, 35%, 8%)";
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "hsl(215, 25%, 20%)";
    ctx.lineWidth = 0.5;

    // Vertical lines
    for (let x = 0; x < width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw ECG line
    if (displayReadings.length > 1) {
      ctx.strokeStyle = stElevationDetected ? "hsl(0, 85%, 55%)" : "hsl(142, 70%, 55%)";
      ctx.lineWidth = 2;
      ctx.beginPath();

      const xStep = width / 200;
      const midY = height / 2;
      const scale = height / 4;

      displayReadings.forEach((value, index) => {
        const x = index * xStep;
        // Normalize AD8232 raw values (~300–380 baseline, spikes ~490)
        const baseline = 340; 
        const gain = 40;      
        const normalized = (value - baseline) / gain;
        const y = midY - normalized * scale;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    }

    // Draw scan line effect
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
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={800}
            height={200}
            className="w-full h-48 rounded-lg border border-ecg-grid soft-shadow fade-in"
          />
          {heartRate && (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-ecg-background/90 px-3 py-1 rounded-md soft-shadow hover-lift transition-all">
              <Heart className="h-4 w-4 text-emergency animate-pulse" />
              <span className="text-ecg-line font-mono font-bold">{heartRate}</span>
              <span className="text-muted-foreground text-sm">BPM</span>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Real-time ECG data from AD8232 sensor via Arduino
        </p>
      </CardContent>
    </Card>
  );
};

export default ECGMonitor;
