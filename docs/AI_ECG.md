AI/ML — ECG analysis

This project includes a serverless ECG analysis function at `supabase/functions/analyze-ecg`.

Environment variables (local & production):

- `VITE_ANALYSIS_URL` — Override client analysis URL (optional). Default used in dev: `http://localhost:54321/functions/v1/analyze-ecg` (Supabase local functions port).
- `HUGGING_FACE_API_KEY` — (optional) If set, the analyze function will call the Hugging Face Inference API to get model predictions. Obtain from https://huggingface.co/settings/tokens.
- `HUGGING_FACE_MODEL` — (optional) Model id on Hugging Face (e.g., `username/ecg-multilabel-1`). The model should accept a JSON payload like `{ "signal": [..], "sampling_rate": 250 }` and return either JSON with `summary`, `patterns`, and `risk_level` fields, or a label array (e.g., `[{label:"ST_ELEVATION",score:0.9}]`).

Behavior:
- If HF vars are present, the function will attempt to call the HF model and use/merge its outputs with built-in heuristics.
- If HF is not configured or returns an error, the function falls back to a heuristic analysis implemented in `analyze-ecg`.

Deployment notes:
- When deploying to Supabase Edge Functions, set the environment variables in the Supabase dashboard or using the `supabase` CLI.
- For production, ensure the HF model used respects privacy and regulatory constraints (PHI may be sensitive).

Quick checklist:
- [ ] Add HF model id & API key in environment
- [ ] Validate model returns expected fields
- [ ] Add unit tests and example ECG fixtures
- [ ] Add starter training pipeline and smoke script (see `docs/ML_TRAINING.md`)