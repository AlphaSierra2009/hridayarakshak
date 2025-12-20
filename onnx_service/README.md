# ONNX Inference Service

A small FastAPI microservice that loads `models/model.onnx` and exposes inference endpoints.

Quick run (local)

1. Ensure you have a trained ONNX model at `models/model.onnx`. Use `scripts/convert_to_onnx.py` to create one.

2. Create a virtualenv and install:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. Start the server:

```bash
uvicorn app:app --reload --port 8000
```

4. Health:

GET http://localhost:8000/health

5. Inference (JSON):

POST http://localhost:8000/infer
{
  "signal": [0.1, 0.2, ...],
  "sampling_rate": 250
}

Docker

Build:

```bash
docker build -t ecg-onnx-service ./onnx_service
```

Run (mount model):

```bash
docker run -p 8000:8000 -v $(pwd)/models:/app/models ecg-onnx-service
```
