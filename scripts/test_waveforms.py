"""Simple tests for generated waveforms (not using pytest to avoid adding test framework complexity).
Run with: python scripts/test_waveforms.py
"""
import numpy as np
from data.prepare_dataset import generate_synthetic


def median(arr):
    a = np.array(arr)
    return np.sort(a)[len(a)//2]


def test_st_elevation():
    sig = generate_synthetic(duration_sec=20, sr=250, kind="st_elevation")
    n = len(sig)
    baseline = median(sig[:int(0.2*n)])
    tail_med = median(sig[int(0.7*n):])
    print("baseline", baseline, "tail_med", tail_med, "increase", tail_med - baseline)
    assert tail_med - baseline > 0.5, "ST elevation not prominent enough"
    print("ST elevation test passed")


def test_afib_variability():
    sig = generate_synthetic(duration_sec=20, sr=250, kind="afib")
    # crude RR-interval estimation: find indices of peaks
    peaks = np.where(sig > np.percentile(sig, 99))[0]
    if len(peaks) < 3:
        raise AssertionError("Not enough peaks detected for AF test")
    rr = np.diff(peaks) / 250.0
    print("rr mean", rr.mean(), "sd", rr.std())
    assert rr.std() > 0.07, "RR variability too low for AF-like signal"
    print("AF variability test passed")


if __name__ == "__main__":
    test_st_elevation()
    test_afib_variability()
