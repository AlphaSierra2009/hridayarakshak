from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

class ECGRequest(BaseModel):
    signal: List[float]
    sampling_rate: Optional[float] = 250.0

class ECGResponse(BaseModel):
    summary: str
    risk_level: str
    patterns: List[str]

app = FastAPI()

def analyze_signal(signal: List[float]) -> ECGResponse:
    from my_model import load_model, preprocess_signal, decode_output

    session = load_model()
    x = preprocess_signal(signal)

    # Run ONNX model. Assumes input name is "input".
    outputs = session.run(None, {session.get_inputs()[0].name: x})

    summary, risk_level, patterns = decode_output(outputs)

    return ECGResponse(
        summary=summary,
        risk_level=risk_level,
        patterns=patterns,
    )

@app.post("/analyze-ecg", response_model=ECGResponse)
async def analyze(payload: ECGRequest):
    return analyze_signal(payload.signal)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)