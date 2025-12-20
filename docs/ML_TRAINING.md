# Training pipeline (starter)

This document shows how to run the starter pipeline locally. It generates synthetic ECG, preprocesses into windows, and trains a small PyTorch model.

Requirements
- Python 3.9+
- Install dependencies (recommend in a venv):

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-ml.txt
```

Quick run (small smoke test)

```bash
# 1) generate synthetic samples
python data/prepare_dataset.py --generate-synthetic --out data/raw --n-samples 60 --duration 10 --sampling-rate 250

# 2) process into windows (5s) -> data/processed/X.npy, y.npy
python data/prepare_dataset.py --input-dir data/raw --out data/processed --window-sec 5 --sr 250

# 3) train for a few epochs
python models/train.py --data data/processed --epochs 5 --batch 8 --save models/checkpoint_smoke.pt
```

Notes
- If you have real recordings in CSV/NumPy/EDF, place them in a directory and add a `labels.json` with entries like `{ "file": "sample_1.npy", "label": "st_elevation" }` or `{"filename":"x.csv","label":"normal"}`.

CSV serial logs
----------------

If you have raw serial logs (e.g., Arduino Serial Monitor dumped to CSV with lines of numeric ADC values or `time,value` rows), use the helper script `scripts/convert_serial_csv.py` to convert them to `.npy` windows:

```bash
# single column (value only), specify sampling rate
python scripts/convert_serial_csv.py --input data/raw/serial_001.csv --out data/raw --sr 250

# two-column CSV (time,value)
python scripts/convert_serial_csv.py --input data/raw/serial_002.csv --out data/raw --time-col 0 --value-col 1
```

The script writes `<basename>.npy` and `<basename>.meta.json` and a small preview PNG (`<basename>_preview.png`). After conversion, you can follow the regular preprocessing step:

```bash
python data/prepare_dataset.py --input-dir data/raw --out data/processed --window-sec 5 --sr 250
```
- The starter model is intentionally small to allow fast CPU runs for iteration. For production you should fine-tune a larger model, add class weighting/oversampling if the dataset is imbalanced, and evaluate with patient-split cross validation.

ONNX conversion & deployment

- After training, export to ONNX with `python scripts/convert_to_onnx.py` (requires `onnx` and `onnxruntime`).
- You can run ONNX models locally with `onnxruntime`, or deploy to a small FastAPI microservice included at `onnx_service/`.
- Run the microservice locally with `uvicorn app:app --reload --port 8000` or build the Docker image (`docker build -t ecg-onnx-service ./onnx_service`).
- To host on Hugging Face Inference, upload the ONNX model to a model repo and follow HF's model server instructions, or convert to a TorchScript/TensorFlow format they support.

Training with your recorded ECG data
-----------------------------------

Use the existing loader utilities in `data/loaders.py` to ingest common formats:

- EDF: install `pyedflib` and place .edf files in a folder with a `labels.json` (see below).
- WFDB: place the WFDB record files (.dat/.hea) together and reference the record base name in `labels.json`.
- CSV / NumPy: one-channel signals can be stored as `.csv` or `.npy` and are supported directly.

Labels format
1. Create a `labels.json` in your dataset folder with entries like:

```json
[
	{ "file": "record1.edf", "label": "st_elevation", "patient_id": "patient_001" },
	{ "file": "record2.npy", "label": "normal", "patient_id": "patient_002" }
]
```

2. Supported label values: `normal`, `st_elevation`, `arrhythmia`, `afib`, `tachycardia`, and others (map to multi-label vectors in preprocessing).

Preprocessing recommendations
- Resample signals to a common sampling rate (250 Hz recommended). `data/prepare_dataset.py` supports resampling and bandpass filtering.
- Normalize per-record (z-score or peak normalization) and remove baseline wander when possible.
- Segment into fixed windows (e.g., 5s) and assign the label for that window (if labels are per-record, use the record label for all windows).
- Augment with baseline wander, powerline noise, muscle artifact, and small time-scaling to increase robustness.

Train/validation splits
- Use patient-level splits (see `data/loaders.patient_split`) to avoid data leakage across splits.
- If you have many recordings per patient, perform a patient-stratified k-fold cross-validation.

Command-line training (example)

```bash
# 1) Prepare the data folder using the loader/preprocessing pipeline
python data/prepare_dataset.py --input-dir data/your-recordings --out data/processed --window-sec 5 --sr 250

# 2) Train with TensorBoard logging
python models/train.py --data data/processed --epochs 30 --batch 16 --save models/checkpoint.pt --log-dir runs/exp1

# 3) (Optional) Use Weights & Biases
python models/train.py --data data/processed --epochs 30 --batch 16 --save models/checkpoint.pt --use-wandb --project your_project_name
```

Evaluation and monitoring
- The training script now emits per-class precision/recall/F1 and per-class AUROC (when possible).
- Use `tensorboard --logdir runs` to inspect curves, or use W&B for richer dashboards.

Export & deploy
- Convert to ONNX: `python scripts/convert_to_onnx.py` and verify with `onnxruntime`.
- Run the `onnx_service` locally or push the Docker image to GHCR (CI workflow will do this on merges to `main`).

Privacy & regulation
- Ensure that any ECG with PHI is handled according to local regulations. Remove or anonymize metadata like timestamps, patient names, or IDs that are not needed for training.
- If you plan to publish or deploy models trained with private data, keep an internal audit trail of consent.

Fixtures & realistic signals

- Generate realistic fixtures for validation with `python scripts/generate_fixtures.py`. These are saved to `data/fixtures`.
- Quick waveform checks: `python scripts/test_waveforms.py` validates ST-elevation prominence and AF-like RR variability for the generated signals.

Privacy
- ECG data is sensitive. Keep datasets private and remove personally identifying metadata. Ensure you have proper consent for using recordings for model training.

Next steps
- Add real ECG loaders (EDF/WFDB), FRAGMENT-level labeling, and richer data augmentation.
- Implement model checkpointing and logging (TensorBoard / Weights & Biases) for better traceability.

CI
- A GitHub Actions workflow is included at `.github/workflows/onnx-service-ci.yml` which performs a short smoke training, converts the checkpoint to ONNX, builds the `onnx_service` Docker image, launches it, and runs an inference smoke test against `/infer` to validate end-to-end behavior.
	- This ensures changes to `models/`, `scripts/`, or `onnx_service/` are validated automatically on push or PR.