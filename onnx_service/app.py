from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
import onnxruntime as ort
import os


class InferRequest(BaseModel):
    signal: list
    sampling_rate: int = 250


app = FastAPI(title="ECG ONNX Inference")

MODEL_PATH = os.environ.get("ONNX_MODEL_PATH", "models/model.onnx")

try:
    sess = ort.InferenceSession(MODEL_PATH)
    input_name = sess.get_inputs()[0].name
except Exception as e:
    sess = None
    print("ONNX model load failed:", e)


@app.get("/health")
async def health():
    return {"ok": sess is not None, "model": MODEL_PATH}


@app.post("/infer")
async def infer(req: InferRequest):
    if sess is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    signal = np.array(req.signal, dtype=np.float32)
    # expect 1D array; if batched, take first
    if signal.ndim != 1:
        signal = signal.flatten()

    # For our SimpleECGNet ONNX, input shape should be (batch, time) or (batch, 1, time)
    # create batch
dummy = signal[np.newaxis, :].astype(np.float32)

    try:
        result = sess.run(None, {input_name: dummy})
        logits = result[0]
        # convert logits to probabilities
        probs = 1 / (1 + np.exp(-logits))
        probs_list = probs[0].tolist()

        # Map to labels (same order as training y columns)
        labels = ["normal", "st_elevation", "afib"]
        out = {labels[i]: probs_list[i] if i < len(probs_list) else None for i in range(len(labels))}

        # simple highest label
        pred_idx = int(np.argmax(probs[0]))
        pred_label = labels[pred_idx]

        return {"predicted_label": pred_label, "probabilities": out}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
