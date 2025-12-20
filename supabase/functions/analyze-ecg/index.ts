import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeRequest {
  signal: number[];
  sampling_rate?: number; // Hz
}

// Simple ST elevation detection (improved)
export function detectSTElevation(readings: number[]): boolean {
  if (readings.length < 20) return false;

  // Robust baseline: median of first 20% of signal
  const nBase = Math.max(3, Math.floor(readings.length * 0.2));
  const baselineSegment = readings.slice(0, nBase);
  const baseline = baselineSegment.slice().sort((a, b) => a - b)[Math.floor(nBase / 2)];

  const diffs = readings.map((r) => r - baseline);
  const std = Math.sqrt(diffs.reduce((s, d) => s + d * d, 0) / diffs.length) || 1;

  // Heuristic A: count values that are many stds above baseline (sensitive to spikes)
  const elevatedStdCount = diffs.filter((d) => d > 1.2 * std).length;

  // Heuristic B: compare median of the tail segment vs baseline (catches sustained step increases)
  const nTail = Math.max(3, Math.floor(readings.length * 0.2));
  const tailSegment = readings.slice(-nTail);
  const tailMedian = tailSegment.slice().sort((a, b) => a - b)[Math.floor(nTail / 2)];

  // Minimum absolute/relative increase required to flag ST elevation
  const minIncrease = Math.max(baseline * 0.15, std * 0.4, 15);
  const tailIncrease = tailMedian - baseline;
  const tailFlag = tailIncrease > minIncrease;

  // Also detect large contiguous elevated runs (>= 25% length)
  const contigThreshold = baseline + Math.max(0.1 * baseline, std * 0.4, 10);
  let maxContig = 0;
  let cur = 0;
  for (let v of readings) {
    if (v > contigThreshold) cur += 1;
    else cur = 0;
    if (cur > maxContig) maxContig = cur;
  }

  const contigFlag = maxContig >= Math.floor(readings.length * 0.25);

  // Final decision: any strong heuristic triggers detection
  return elevatedStdCount > readings.length * 0.25 || tailFlag || contigFlag;
}

export function movingAverage(arr: number[], window = 5) {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= window) sum -= arr[i - window];
    out.push(sum / Math.min(window, i + 1));
  }
  return out;
}

export function detectBeats(signal: number[], sampling_rate = 250) {
  // Smooth signal and find local maxima above dynamic threshold
  const smooth = movingAverage(signal, 7);
  const median = smooth.slice().sort((a, b) => a - b)[Math.floor(smooth.length / 2)] || 0;
  const sd = Math.sqrt(smooth.reduce((s, v) => s + (v - median) * (v - median), 0) / smooth.length) || 1;
  const thresh = median + sd * 0.9; // adaptive

  const peaks: number[] = [];
  for (let i = 1; i < smooth.length - 1; i++) {
    if (smooth[i] > thresh && smooth[i] > smooth[i - 1] && smooth[i] >= smooth[i + 1]) {
      // simple refractory: avoid peaks too close (<200ms)
      if (peaks.length === 0 || (i - peaks[peaks.length - 1]) / sampling_rate > 0.18) {
        peaks.push(i);
      }
    }
  }

  const rrIntervalsSec: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    rrIntervalsSec.push((peaks[i] - peaks[i - 1]) / sampling_rate);
  }

  const bpm = rrIntervalsSec.length > 0 ? 60 / (rrIntervalsSec.reduce((a, b) => a + b, 0) / rrIntervalsSec.length) : null;
  const sdnn = rrIntervalsSec.length > 0 ? Math.sqrt(rrIntervalsSec.reduce((s, r) => s + Math.pow(r - (rrIntervalsSec.reduce((a, b) => a + b, 0) / rrIntervalsSec.length), 2), 0) / rrIntervalsSec.length) : null;

  return { peaks, rrIntervalsSec, bpm, sdnn };
}

export async function analyzeSignal(signal: number[], sampling_rate = 250) {
  // Basic analyses (heuristic)
  const stElevationDetected = detectSTElevation(signal);

  const { peaks, rrIntervalsSec, bpm, sdnn } = detectBeats(signal, sampling_rate);

  const patterns: string[] = [];

  if (stElevationDetected) patterns.push("st_elevation");

  if (bpm !== null) {
    if (bpm < 50) patterns.push("bradycardia");
    if (bpm > 100) patterns.push("tachycardia");
  }

  // AF detection heuristic: high RR variability and many short/long intervals
  if (rrIntervalsSec.length >= 5 && sdnn !== null) {
    const meanRR = rrIntervalsSec.reduce((a, b) => a + b, 0) / rrIntervalsSec.length;
    const cv = sdnn / meanRR; // coefficient of variation
    if (cv > 0.2 && sdnn > 0.08) patterns.push("possible_afib");
  }

  // Default risk scoring
  let risk_level: "low" | "medium" | "high" = "low";
  if (stElevationDetected) risk_level = "high";
  else if (patterns.includes("possible_afib") || patterns.includes("tachycardia")) risk_level = "medium";

  // Prefer ONNX service (if configured), then Hugging Face, then heuristic
  try {
    const onnxUrl = Deno.env.get("ONNX_SERVICE_URL");

    if (onnxUrl) {
      try {
        console.log("Calling ONNX service:", onnxUrl);
        const onnxRes = await fetch(onnxUrl.replace(/\/$/, "") + "/infer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signal, sampling_rate }),
        });

        if (onnxRes.ok) {
          const onnxData = await onnxRes.json();
          console.log("ONNX response:", onnxData);
          const probs = onnxData.probabilities || {};

          if ((probs["st_elevation"] ?? probs["ST_ELEVATION"] ?? 0) > 0.5 && !patterns.includes("st_elevation")) patterns.push("st_elevation");
          if ((probs["afib"] ?? 0) > 0.4 && !patterns.includes("possible_afib")) patterns.push("possible_afib");
          if ((probs["tachycardia"] ?? 0) > 0.5 && !patterns.includes("tachycardia")) patterns.push("tachycardia");

          if ((probs["st_elevation"] ?? 0) > 0.6) risk_level = "high";
          else if ((probs["afib"] ?? 0) > 0.4) risk_level = "medium";

          const resultOnnx = {
            summary: onnxData.summary || null,
            patterns,
            risk_level,
            details: {
              bpm: onnxData.details?.bpm ?? (bpm ? Number(bpm.toFixed(1)) : null),
              sdnn: onnxData.details?.sdnn ?? (sdnn ? Number(sdnn.toFixed(3)) : null),
              peaks: onnxData.details?.peaks ?? peaks.length,
              signal_length: signal.length,
            },
            _source: "onnx",
            _onnx_raw: onnxData,
          };

          if (resultOnnx.summary) return resultOnnx;
          // else merge and continue
        } else {
          console.warn("ONNX service failed:", onnxRes.status, await onnxRes.text());
        }
      } catch (onnxErr) {
        console.error("ONNX inference error, continuing:", onnxErr);
      }
    }

    // Try Hugging Face Inference (if configured) to improve/override predictions
    const hfKey = Deno.env.get("HUGGING_FACE_API_KEY");
    const hfModel = Deno.env.get("HUGGING_FACE_MODEL");

    if (hfKey && hfModel) {
      console.log("Calling Hugging Face model:", hfModel);
      const hfUrl = `https://api-inference.huggingface.co/models/${hfModel}`;
      const hfRes = await fetch(hfUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: { signal, sampling_rate } }),
      });

      if (hfRes.ok) {
        const hfData = await hfRes.json();
        console.log("HF response:", hfData);

        // Interpret HF response (best-effort): support structured outputs or label arrays
        // If HF returns an object with our fields, use them directly
        if (hfData && typeof hfData === "object") {
          if (hfData.summary || hfData.patterns || hfData.risk_level) {
            const hfPatterns = Array.isArray(hfData.patterns) ? hfData.patterns : [];
            for (const p of hfPatterns) {
              if (!patterns.includes(p)) patterns.push(p);
            }

            if (hfData.risk_level) risk_level = hfData.risk_level;

            // prefer HF summary if available
            const hfSummary = hfData.summary || null;

            const resultHf = {
              summary: hfSummary || null,
              patterns,
              risk_level,
              details: {
                bpm: hfData.details?.bpm ?? (bpm ? Number(bpm.toFixed(1)) : null),
                sdnn: hfData.details?.sdnn ?? (sdnn ? Number(sdnn.toFixed(3)) : null),
                peaks: hfData.details?.peaks ?? peaks.length,
                signal_length: signal.length,
              },
              _model: hfModel,
              _source: "huggingface",
              _hf_raw: hfData,
            };

            if (resultHf.summary) return resultHf;

            // else continue and fall back to merging
          } else if (Array.isArray(hfData) && hfData.length > 0 && hfData[0].label) {
            // typical text-classification output: [{label,score}, ...]
            const hfLabels = hfData.map((l: any) => l.label.toLowerCase());
            for (const p of hfLabels) {
              if (!patterns.includes(p)) patterns.push(p);
            }

            // set risk heuristically
            if (patterns.includes("st_elevation")) risk_level = "high";
            else if (patterns.includes("possible_afib") || patterns.includes("tachycardia")) risk_level = "medium";

            // continue to final result
          } else {
            console.log("HF returned unrecognized schema, ignoring and falling back to heuristic");
          }
        }
      } else {
        console.warn("Hugging Face inference failed:", hfRes.status, await hfRes.text());
      }
    }
  } catch (err) {
    console.error("Inference error (ONNX/HF), falling back to heuristic:", err);
  }

  // Compose human summary from merged heuristics
  const summaryParts: string[] = [];
  if (stElevationDetected || patterns.includes("st_elevation")) summaryParts.push("ST elevation pattern detected — potential myocardial infarction (urgent)");
  if (patterns.includes("possible_afib")) summaryParts.push("Irregular heartbeat pattern detected — possible atrial fibrillation");
  if (patterns.includes("bradycardia")) summaryParts.push("Low heart rate (bradycardia)");
  if (patterns.includes("tachycardia")) summaryParts.push("High heart rate (tachycardia)");
  if (summaryParts.length === 0) summaryParts.push("No major abnormalities detected in the supplied segment.");

  const result = {
    summary: summaryParts.join(" "),
    patterns,
    risk_level,
    details: {
      bpm: bpm ? Number(bpm.toFixed(1)) : null,
      sdnn: sdnn ? Number(sdnn.toFixed(3)) : null,
      peaks: peaks.length,
      signal_length: signal.length,
    },
    _source: "heuristic",
  };

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signal, sampling_rate = 250 } = (await req.json()) as AnalyzeRequest;

    if (!Array.isArray(signal) || signal.length === 0) {
      return new Response(
        JSON.stringify({ error: "Signal is required (non-empty array)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await analyzeSignal(signal, sampling_rate);

    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("analyze-ecg error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
