import numpy as np
import onnxruntime as ort
from typing import List, Tuple

# Path to your exported ONNX model
MODEL_PATH = "ecg_model.onnx"

# Global session (loaded once)
session = None

def load_model():
    global session
    if session is None:
        session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
    return session

def preprocess_signal(signal: List[float]) -> np.ndarray:
    """
    Prepares raw ECG values for the ONNX model.
    Modify this according to your model's expected input shape.
    Example assumes model expects shape: (1, sequence_length, 1)
    """
    x = np.array(signal, dtype=np.float32)
    x = (x - np.mean(x)) / (np.std(x) + 1e-6)  # Normalize
    x = x.reshape(1, -1, 1)  # (batch, length, channels)
    return x

def decode_output(output: List[np.ndarray]) -> Tuple[str, str, List[str]]:
    """
    Convert model output into summary, risk_level, patterns.
    You MUST modify this according to your ONNX model's output.
    Placeholder logic added here.
    """
    logits = output[0][0]  # Example: model outputs class logits
    predicted_class = int(np.argmax(logits))

    class_labels = {
        0: ("Normal sinus rhythm", "low", ["normal"]),
        1: ("Possible ST elevation", "high", ["st_elevation"]),
        2: ("Arrhythmia detected", "medium", ["arrhythmia"]),
    }

    if predicted_class in class_labels:
        summary, risk_level, patterns = class_labels[predicted_class]
    else:
        summary = "Unknown pattern detected"
        risk_level = "unknown"
        patterns = ["unknown"]

    return summary, risk_level, patterns
