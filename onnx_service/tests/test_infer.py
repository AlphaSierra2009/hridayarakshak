import requests
import numpy as np


def test_health():
    r = requests.get("http://localhost:8000/health")
    assert r.status_code == 200


def test_infer_smoke():
    # send a short synthetic normal signal
    sig = (0.2 * np.sin(2 * np.pi * np.arange(0, 5, 1/250))).tolist()
    r = requests.post("http://localhost:8000/infer", json={"signal": sig, "sampling_rate": 250})
    assert r.status_code == 200
    j = r.json()
    assert "probabilities" in j
