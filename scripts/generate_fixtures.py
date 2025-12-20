"""Generate and save a few realistic fixture signals for testing and model validation."""
import os
import numpy as np
from data.prepare_dataset import generate_synthetic


def main():
    os.makedirs("data/fixtures", exist_ok=True)
    kinds = ["normal", "st_elevation", "afib", "tachy"]
    sr = 250
    for kind in kinds:
        sig = generate_synthetic(duration_sec=30, sr=sr, kind=kind)
        path = os.path.join("data/fixtures", f"{kind}_30s_{sr}hz.npy")
        np.save(path, sig.astype(np.float32))
        print("Saved", path)

if __name__ == "__main__":
    main()
