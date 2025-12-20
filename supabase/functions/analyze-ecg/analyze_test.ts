import { assert, assertEquals, assertAlmostEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { detectSTElevation, detectBeats, analyzeSignal } from "./index.ts";

Deno.test("detectSTElevation identifies elevated segment", () => {
  const baseline = Array(200).fill(100);
  const elevated = Array(200).fill(200);
  const signal = baseline.concat(elevated);

  const detected = detectSTElevation(signal);
  assert(detected, "ST elevation should be detected");
});

Deno.test("detectBeats finds peaks and reasonable BPM", () => {
  const sampling = 250;
  const durationSec = 10;
  const samples = sampling * durationSec;
  const signal = new Array(samples).fill(0);

  const beatIntervalSamples = Math.round(sampling * 0.8); // 0.8s => 75 BPM
  for (let i = 0; i < samples; i += beatIntervalSamples) {
    signal[i] = 1000; // spike
  }

  const { peaks, bpm } = detectBeats(signal, sampling);
  assert(peaks.length >= 9, "Should detect ~10 peaks");
  // bpm may be null if not enough intervals, guard
  if (bpm !== null) {
    // allow tolerance
    assert(Math.abs(bpm - 75) < 6, `BPM should be ~75 but was ${bpm}`);
  } else {
    throw new Error("bpm was null");
  }
});

Deno.test("analyzeSignal uses Hugging Face when configured", async () => {
  // Setup mock HF response
  Deno.env.set("HUGGING_FACE_API_KEY", "test-key");
  Deno.env.set("HUGGING_FACE_MODEL", "test/model");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      summary: "HF: ST elevation",
      patterns: ["st_elevation"],
      risk_level: "high",
      details: { bpm: 85 },
    }),
  } as any);

  const signal = Array(250).fill(100).map((v, i) => (i > 50 ? 200 : 100));

  const result = await analyzeSignal(signal, 250);

  assertEquals(result._source, "huggingface");
  assertEquals(result.patterns.includes("st_elevation"), true);
  assertEquals(result.risk_level, "high");
  assertEquals(result.details.bpm, 85);

  // cleanup
  globalThis.fetch = originalFetch;
  Deno.env.delete("HUGGING_FACE_API_KEY");
  Deno.env.delete("HUGGING_FACE_MODEL");
});

Deno.test("analyzeSignal heuristic detects ST elevation when HF not configured", async () => {
  const signal = Array(200).fill(100).concat(Array(200).fill(200));
  const result = await analyzeSignal(signal, 250);
  if (!result.patterns.includes("st_elevation")) {
    throw new Error("expected st_elevation in patterns");
  }
  assertEquals(result.risk_level, "high");
});
