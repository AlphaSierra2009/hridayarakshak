import { useEffect, useRef, useState } from "react";
import emailjs from "@emailjs/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import useECGStream from "@/hooks/useECGStream";
import { useLocation } from "@/hooks/useLocation";
import { callTriggerEmergency } from "@/lib/alerts";
import { toast } from "sonner";

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
  const bufferRef = useRef<number[]>([]); // Store ECG values without triggering React re-renders
  const { reading: ecg } = useECGStream();
  const [, forceRender] = useState(0); // used only to refresh graph occasionally

  // UI states
  const [smoothing, setSmoothing] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [computedBpm, setComputedBpm] = useState<number | null>(null);

  // Auto-trigger: opt-in toggle, arming state, countdown and rate-limiting
  const { location } = useLocation();
  const [autoTriggerEnabled, setAutoTriggerEnabled] = useState<boolean>(false);
  const [armed, setArmed] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [lastTriggeredAt, setLastTriggeredAt] = useState<number | null>(null);

  const stSinceRef = useRef<number | null>(null);
  const armingTimerRef = useRef<number | null>(null);
  const simulateRef = useRef<number | null>(null);
  const lastNotifAtRef = useRef<number | null>(null);
  const COUNTDOWN_INTERVAL_MS = 1000;
  const TRIGGER_THRESHOLD = 25; // percent
  const SUSTAIN_SECONDS = 5; // need sustained ST% >= threshold for this many seconds
  const ARM_COUNTDOWN = 3; // seconds countdown before firing
  const RATE_LIMIT_MS = 2 * 60 * 1000; // 2 minutes
  const NOTIFICATION_COOLDOWN_MS = 30 * 1000; // don't spam notifications more often than this

  // Helper: Find nearest hospital using Overpass API
  const findNearestHospital = async (lat: number, lon: number) => {
    try {
      const query = `
        [out:json][timeout:10];
        (
          node["amenity"="hospital"](around:5000,${lat},${lon});
          way["amenity"="hospital"](around:5000,${lat},${lon});
        );
        out center 1;
      `;

      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!res.ok) throw new Error("Overpass failed");
      const data = await res.json();
      const el = data.elements?.[0];
      return el?.tags?.name || "Nearest hospital not found";
    } catch {
      return "Hospital lookup failed";
    }
  };


  // Developer helper: simulate sustained high ST% for testing
  const startSimulate = (secs = 8) => {
    if (simulateRef.current) {
      clearInterval(simulateRef.current);
      simulateRef.current = null;
    }
    let elapsed = 0;
    setAutoTriggerEnabled(true);
    setStPercent(TRIGGER_THRESHOLD + 50);
    simulateRef.current = window.setInterval(() => {
      elapsed += 1;
      setStPercent(TRIGGER_THRESHOLD + 50);
      if (elapsed >= secs) {
        if (simulateRef.current) {
          clearInterval(simulateRef.current);
          simulateRef.current = null;
        }
        setStPercent(null);
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (simulateRef.current) {
        clearInterval(simulateRef.current);
        simulateRef.current = null;
      }
      if (armingTimerRef.current) {
        clearInterval(armingTimerRef.current);
        armingTimerRef.current = null;
      }
    };
  }, []);

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
  const [stPercent, setStPercent] = useState<number | null>(null);

  useEffect(() => {
    let frame: number;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // handle high-DPI displays
      const dpr = window.devicePixelRatio || 1;
      const width = Math.floor(canvas.clientWidth * dpr);
      const height = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear - use CSS variable for ECG background
      ctx.fillStyle = 'hsl(' + getComputedStyle(document.documentElement).getPropertyValue('--ecg-background') + ')';
      ctx.fillRect(0, 0, width, height);

      // Grid (optional)
      if (showGrid) {
        ctx.strokeStyle = 'hsl(' + getComputedStyle(document.documentElement).getPropertyValue('--ecg-grid') + ')';
        ctx.lineWidth = Math.max(0.4 * dpr, 0.5);

        for (let x = 0; x < width; x += 20 * dpr) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y < height; y += 20 * dpr) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      }

      // ECG Line (auto scaling)
      const arr = bufferRef.current.slice(-200);
      if (arr.length > 1) {
        // Optionally smooth
        let arrDraw = arr;
        if (smoothing) {
          const window = 3;
          arrDraw = arr.map((v, i, a) => {
            const start = Math.max(0, i - Math.floor(window / 2));
            const end = Math.min(a.length, i + Math.floor(window / 2) + 1);
            const slice = a.slice(start, end);
            return slice.reduce((s, x) => s + x, 0) / slice.length;
          });
        }

        // Compute dynamic min/max
        const minV = Math.min(...arrDraw);
        const maxV = Math.max(...arrDraw);
        const range = maxV - minV || 1;

        // Compute ST percent locally (lightweight heuristic)
        try {
          const nBase = Math.max(3, Math.floor(arrDraw.length * 0.2));
          const baseline = arrDraw.slice(0, nBase).slice().sort((a, b) => a - b)[Math.floor(nBase / 2)];
          const diffs = arrDraw.map((v) => v - baseline);
          const std = Math.sqrt(diffs.reduce((s, d) => s + d * d, 0) / diffs.length) || 1;
          const minIncrease = Math.max(baseline * 0.15, std * 0.4, 15);
          const threshold = baseline + minIncrease;
          const elevatedCount = arrDraw.filter((v) => v > threshold).length;
          const percent = Math.round((elevatedCount / arrDraw.length) * 100);
          if (stPercent !== percent) setStPercent(percent);
        } catch (e) {
          /* ignore */
        }

        ctx.strokeStyle = stElevationDetected ? ('hsl(' + getComputedStyle(document.documentElement).getPropertyValue('--ecg-alert') + ')') : ('hsl(' + getComputedStyle(document.documentElement).getPropertyValue('--ecg-line') + ')');
        ctx.lineWidth = Math.max(1.5 * dpr, 2);
        ctx.beginPath();

        const xStep = width / Math.max(arrDraw.length - 1, 1);
        arrDraw.forEach((value, i) => {
          const x = i * xStep;
          const y = height - ((value - minV) / range) * height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });

        ctx.stroke();

        // Simple BPM estimation for overlay (lightweight)
        try {
          const peaks: number[] = [];
          for (let i = 1; i < arrDraw.length - 1; i++) {
            if (arrDraw[i] > arrDraw[i - 1] && arrDraw[i] > arrDraw[i + 1] && arrDraw[i] > (minV + range * 0.5)) {
              if (peaks.length === 0 || i - peaks[peaks.length - 1] > 6) peaks.push(i);
            }
          }
          if (peaks.length >= 2) {
            const rr = [] as number[];
            for (let i = 1; i < peaks.length; i++) rr.push((peaks[i] - peaks[i - 1]) / 24.39); // use dataset sr approx
            const meanRR = rr.reduce((s, x) => s + x, 0) / rr.length;
            const bpm = 60 / meanRR;
            setComputedBpm(Math.round(bpm));
          }
        } catch (e) {
          /* ignore */
        }
      }

      frame = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frame);
  }, [stElevationDetected, smoothing, showGrid]);

  // Auto-trigger detection: watch stPercent and handle arming/countdown/trigger
  useEffect(() => {
    if (!autoTriggerEnabled) {
      stSinceRef.current = null;
      if (armingTimerRef.current) {
        clearInterval(armingTimerRef.current);
        armingTimerRef.current = null;
        setCountdown(null);
        setArmed(false);
      }
      return;
    }

    const now = Date.now();

    // Respect rate-limiting
    if (lastTriggeredAt && now - lastTriggeredAt < RATE_LIMIT_MS) {
      // still cooling down
      return;
    }

    if (stPercent !== null && stPercent >= TRIGGER_THRESHOLD) {
      // show a local notification to draw attention (non-triggering)
      try {
        const last = lastNotifAtRef.current ?? 0;
        if (Date.now() - last > NOTIFICATION_COOLDOWN_MS) {
          lastNotifAtRef.current = Date.now();
          if (typeof Notification !== "undefined") {
            if (Notification.permission === "granted") {
              new Notification("ST elevation detected", { body: `ST% ${stPercent}%` });
            } else if (Notification.permission !== "denied") {
              Notification.requestPermission().then((perm) => { if (perm === "granted") new Notification("ST elevation detected", { body: `ST% ${stPercent}%` }); });
            }
          }
        }
      } catch (nErr) { console.warn('Notification', nErr); }

      if (!stSinceRef.current) stSinceRef.current = now;
      const elapsed = (now - (stSinceRef.current ?? now)) / 1000;
      if (elapsed >= SUSTAIN_SECONDS && !armed && !countdown) {
        // start arming countdown
        setArmed(true);
        setCountdown(ARM_COUNTDOWN);
        armingTimerRef.current = window.setInterval(() => {
          setCountdown((c) => {
            if (c === null) return null;
            if (c <= 1) {
              // countdown complete - trigger
              if (armingTimerRef.current) {
                clearInterval(armingTimerRef.current);
                armingTimerRef.current = null;
              }
              setCountdown(null);
              setArmed(false);
              // Fire emergency trigger
              (async () => {
                try {
                  const payload = {
                    latitude: location?.latitude ?? null,
                    longitude: location?.longitude ?? null,
                    alert_type: "auto",
                    notes: `Auto-trigger: ST% ${stPercent}% sustained`,
                    reading: bufferRef.current.slice(-200),
                    stemi_level: stPercent ?? null,
                    is_test: false,
                  } as any;

                  const resp = await callTriggerEmergency(payload);
                  setLastTriggeredAt(Date.now());
                  toast.success("Emergency auto-triggered — help is being notified.");

                  // Browser notification (if permission granted)
                  if (typeof Notification !== "undefined") {
                    try {
                      if (Notification.permission === "granted") {
                        new Notification("Emergency triggered", { body: `ST% ${stPercent}% — alert sent` });
                      } else if (Notification.permission !== "denied") {
                        Notification.requestPermission().then((perm) => {
                          if (perm === "granted") new Notification("Emergency triggered", { body: `ST% ${stPercent}% — alert sent` });
                        });
                      }
                    } catch (nErr) { console.warn('Notification failed', nErr); }
                  }

                  console.log('trigger response', resp);
                } catch (err: any) {
                  console.error("Auto trigger failed", err);
                  toast.error(err?.message || "Failed to auto-trigger emergency");
                }
              })();
              return null;
            }
            return c - 1;
          });
        }, COUNTDOWN_INTERVAL_MS);
      }
    } else {
      // ST% dropped below threshold — reset arming
      stSinceRef.current = null;
      if (armingTimerRef.current) {
        clearInterval(armingTimerRef.current);
        armingTimerRef.current = null;
        setCountdown(null);
        setArmed(false);
      }
    }

    return () => {
      // do not clear the armingTimer here; it's handled on success/cancel
    };
  }, [stPercent, autoTriggerEnabled, armed, countdown, lastTriggeredAt, location]);

  const cancelArming = () => {
    stSinceRef.current = null;
    if (armingTimerRef.current) {
      clearInterval(armingTimerRef.current);
      armingTimerRef.current = null;
    }
    setCountdown(null);
    setArmed(false);
    toast.info("Auto-trigger cancelled");
  };

  const canEnableAutoTrigger = () => {
    if (!location) return true; // allow enabling even if location not yet available
    if (!lastTriggeredAt) return true;
    return Date.now() - lastTriggeredAt > RATE_LIMIT_MS;
  };


  const exportCSV = () => {
    const arr = bufferRef.current.slice(-200);
    if (!arr.length) return;
    const csv = arr.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ecg_export_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setLastExport(new Date().toISOString());
  };

  return (
    <Card className="border border-gray-700 p-2">
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-green-400" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">ECG Monitor</span>
              <span className="text-xs text-foreground/70">{isConnected ? "Connected" : "Disconnected"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {computedBpm && <div className="text-sm font-medium">BPM: {computedBpm}</div>}
            <div className={`text-sm font-medium ${stPercent !== null && stPercent > 20 ? 'text-destructive' : 'text-foreground/70'}`}>ST%: {stPercent ?? '--'}%</div>

            {/* Auto-trigger toggle & arming UI */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoTriggerEnabled((v) => !v)}
                className={`px-2 py-1 rounded-md text-xs hover:bg-gray-800 focus:ring-2 focus:ring-primary ${autoTriggerEnabled ? "bg-red-700 text-white" : ""}`}
                aria-pressed={autoTriggerEnabled}
                title="Toggle auto-trigger (experimental)"
                disabled={!canEnableAutoTrigger()}
              >
                {autoTriggerEnabled ? "Auto ON" : "Auto"}
              </button>

              {armed && (
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-destructive">Arming: {countdown}s</div>
                  <button onClick={cancelArming} className="px-2 py-1 rounded-md text-xs hover:bg-gray-800 focus:ring-2 focus:ring-primary">Cancel</button>
                </div>
              )}

              {/* Dev-only simulate button (Vite dev mode) */}
              {(import.meta.env as any).DEV && (
                <>
                  <button onClick={() => startSimulate(8)} className="px-2 py-1 rounded-md text-xs bg-gray-700 hover:bg-gray-600" title="Simulate sustained ST elevation for testing">Sim ST</button>
                  <button
                    onClick={async () => {
                      // Trigger a test alert immediately using current buffer
                      const testPayload = {
                        latitude: location?.latitude ?? null,
                        longitude: location?.longitude ?? null,
                        alert_type: "test",
                        notes: "Test STEMI alert (manual)",
                        reading: bufferRef.current.slice(-200),
                        stemi_level: stPercent ?? 80,
                        is_test: true,
                      } as any;
                      try {
                        const r = await callTriggerEmergency(testPayload);
                        toast.success("Test alert sent");
                        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                          new Notification("Test Alert sent", { body: `ST% ${testPayload.stemi_level}%` });
                        }
                        console.log('test trigger', r);

                        // ---- EmailJS emergency email ----
                        try {
                          const lat = location?.latitude ?? null;
                          const lon = location?.longitude ?? null;

                          const googleMap =
                            lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : "Location unavailable";

                          let hospital = "Location unavailable";
                          if (lat && lon) {
                            hospital = await findNearestHospital(lat, lon);
                          }

                          await emailjs.send(
                            "service_dewhim4",
                            "template_rifct2b",
                            {
                              alert_type: "TEST STEMI ALERT",
                              stemi_level: testPayload.stemi_level,
                              latitude: lat,
                              longitude: lon,
                              google_map: googleMap,
                              nearest_hospital: hospital,
                            },
                            "RbN4Qs2il-qWu_Pcq"
                          );

                          toast.success("Emergency email sent");
                        } catch (emailErr) {
                          console.error("EmailJS failed", emailErr);
                          toast.error("Email failed to send");
                        }
                        // ---- end EmailJS emergency email ----
                      } catch (e) {
                        console.error('Test trigger failed', e);
                        toast.error('Failed to send test alert');
                      }
                    }}
                    className="px-2 py-1 rounded-md text-xs bg-yellow-700 hover:bg-yellow-600"
                    title="Send a test STEMI alert"
                  >
                    Test STEMI
                  </button>
                </>
              )}
            </div>

            <button
              onClick={() => setSmoothing((s) => !s)}
              className={`px-2 py-1 rounded-md text-xs hover:bg-gray-800 focus:ring-2 focus:ring-primary ${smoothing ? "bg-gray-800" : ""}`}
              aria-pressed={smoothing}
              title="Toggle smoothing"
            >
              {smoothing ? "Smooth ON" : "Smooth"}
            </button>

            <button
              onClick={() => setShowGrid((g) => !g)}
              className={`px-2 py-1 rounded-md text-xs hover:bg-gray-800 focus:ring-2 focus:ring-primary ${showGrid ? "bg-gray-800" : ""}`}
              aria-pressed={showGrid}
              title="Toggle grid"
            >
              Grid
            </button>

            <button
              onClick={exportCSV}
              className="px-2 py-1 rounded-md text-xs hover:bg-gray-800 focus:ring-2 focus:ring-primary"
              title="Export last samples as CSV"
            >
              Export
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <canvas
          ref={canvasRef}
          width={800}
          height={220}
          style={{
            width: "100%",
            height: "220px",
            background: "hsl(var(--ecg-background))",
            borderRadius: "10px",
          }}
          aria-label="ECG waveform canvas"
        ></canvas>
        {lastExport && <div className="text-xs text-foreground/60 mt-2">Last export: {lastExport}</div>}
      </CardContent>
    </Card>
  );
};

export default ECGMonitor;