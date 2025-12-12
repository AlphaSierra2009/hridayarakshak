import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import useECGStream from "@/hooks/useECGStream";

interface ECGMonitorProps {
  readings: any[];
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
  const bufferRef = useRef<number[]>([]);  // 🔥 Store ECG values WITHOUT triggering React re-renders
  const { reading: ecg } = useECGStream();
  const [, forceRender] = useState(0);     // used only to refresh graph occasionally

  // STEP 1 — Push Arduino values into buffer (NO STATE UPDATES)
  useEffect(() => {
    if (ecg == null) return;

    bufferRef.current.push(ecg);
    if (bufferRef.current.length > 200) {
      bufferRef.current = bufferRef.current.slice(-200);
    }
  }, [ecg]);

  // STEP 2 — Push Supabase historical readings ONCE (not every render)
  useEffect(() => {
    if (!readings.length) return;

    const values = readings.slice(-200).map((r) => r.reading_value);
    bufferRef.current = values;
  }, [readings]);

  // STEP 3 — Draw ECG at ~60 FPS using requestAnimationFrame
  useEffect(() => {
    let frame: number;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      // Clear
      ctx.fillStyle = "#0a0f1c";
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = "#1f2a40";
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

      // ECG Line (Arduino Serial Plotter Style — RAW Values, Auto Scaling)
      const arr = bufferRef.current;
      if (arr.length > 1) {
        ctx.strokeStyle = stElevationDetected ? "#ff4d4d" : "#4dff88";
        ctx.lineWidth = 2;
        ctx.beginPath();

        const xStep = width / 200;

        // Compute dynamic min/max like Arduino Serial Plotter
        const minV = Math.min(...arr);
        const maxV = Math.max(...arr);
        const range = maxV - minV || 1;

        arr.forEach((value, i) => {
          const x = i * xStep;

          // Scale raw value directly to canvas height (Arduino style)
          const y = height - ((value - minV) / range) * height;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });

        ctx.stroke();
      }

      frame = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frame);
  }, [stElevationDetected]);

  return (
    <Card className="border border-gray-700 p-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-400" />
          ECG Monitor
        </CardTitle>
        <Badge>{isConnected ? "Connected" : "Disconnected"}</Badge>
      </CardHeader>

      <CardContent>
        <canvas
          ref={canvasRef}
          width={800}
          height={220}
          style={{
            width: "100%",
            height: "220px",
            background: "#0a0f1c",
            borderRadius: "10px",
          }}
        ></canvas>
      </CardContent>
    </Card>
  );
};

export default ECGMonitor;