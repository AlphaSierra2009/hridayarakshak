"""Data preparation for ECG training.

Supports:
- Generating small synthetic dataset (normal, st_elevation, afib-like)
- Preprocessing (bandpass filtering and normalization)
- Windowing into fixed-length segments and saving X.npy, y.npy

Usage examples:
python data/prepare_dataset.py --generate-synthetic --out data/raw --n-samples 50 --duration 10 --sampling-rate 250
python data/prepare_dataset.py --input-dir data/raw --out data/processed --window-sec 5 --sr 250
"""

import argparse
import os
import json
import numpy as np

# Prefer scipy if available for stable filters, but provide an FFT fallback if not installed.
try:
    from scipy.signal import butter, filtfilt

    def bandpass(signal, lowcut, highcut, fs, order=3):
        nyq = 0.5 * fs
        low = lowcut / nyq
        high = highcut / nyq
        b, a = butter(order, [low, high], btype="band")
        return filtfilt(b, a, signal)
except Exception:
    print("scipy not available; using FFT-based bandpass fallback (less precise)")

    def bandpass(signal, lowcut, highcut, fs, order=3):
        # simple FFT bandpass: zero out frequencies outside [lowcut, highcut]
        X = np.fft.rfft(signal)
        freqs = np.fft.rfftfreq(len(signal), 1.0 / fs)
        mask = (freqs >= lowcut) & (freqs <= highcut)
        X[~mask] = 0
        y = np.fft.irfft(X, n=len(signal))
        return y


def normalize(sig):
    s = np.array(sig, dtype=np.float32)
    s = (s - np.mean(s)) / (np.std(s) + 1e-8)
    return s


def add_baseline_wander(sig, sr, max_amplitude=0.5):
    # slow low-frequency wander (e.g., respiratory)
    t = np.arange(len(sig)) / sr
    freq = np.random.uniform(0.1, 0.3)
    wander = max_amplitude * 0.5 * np.sin(2 * np.pi * freq * t)
    return sig + wander


def add_powerline_noise(sig, sr, amplitude=0.02):
    # 50/60 Hz powerline noise
    t = np.arange(len(sig)) / sr
    freq = 50 if sr >= 250 else 60
    return sig + amplitude * np.sin(2 * np.pi * freq * t)


def add_muscle_noise(sig, amplitude=0.05):
    return sig + amplitude * np.random.normal(0, 1, size=len(sig))


def generate_synthetic(duration_sec=10, sr=250, kind="normal"):
    t = np.arange(0, duration_sec, 1 / sr)
    # simple baseline sine + small QRS spikes
    base = 0.2 * np.sin(2 * np.pi * 1 * t)

    # Add periodic spikes for beats
    signal = base.copy()

    if kind == "tachy":
        beat_interval = int(sr * 0.5)
    else:
        beat_interval = int(sr * 0.8)

    # Regular or jittered beat positions
    if kind == "afib":
        pos = 0
        while pos < len(t):
            jitter = np.random.randint(int(0.4 * sr), int(1.4 * sr))
            amp = np.random.uniform(0.6, 1.2)
            if pos + 3 < len(t):
                signal[pos : pos + 3] += np.array([0.6 * amp, 1.0 * amp, 0.4 * amp])
            pos += jitter
    else:
        for i in range(0, len(t), beat_interval):
            if i + 3 < len(t):
                signal[i : i + 3] += np.array([0.8, 1.2, 0.6])

    if kind == "st_elevation":
        # add sustained elevation in the tail half
        idx = len(signal) // 2
        signal[idx:] += 1.0 + 0.2 * np.random.randn(len(signal) - idx)

    # augmentations: baseline wander, powerline, muscle noise
    signal = add_baseline_wander(signal, sr, max_amplitude=0.3)
    signal = add_powerline_noise(signal, sr, amplitude=0.02)
    signal = add_muscle_noise(signal, amplitude=0.03)

    # add small random noise
    signal += 0.01 * np.random.randn(len(signal))

    return signal


def create_windows(signal, sr, window_sec=5):
    step = int(window_sec * sr)
    X = []
    for i in range(0, len(signal) - step + 1, step):
        seg = signal[i : i + step]
        X.append(seg)
    return np.array(X)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--generate-synthetic", action="store_true")
    parser.add_argument("--out", default="data/raw")
    parser.add_argument("--n-samples", type=int, default=30)
    parser.add_argument("--duration", type=int, default=10)
    parser.add_argument("--sampling-rate", type=int, default=250)
    parser.add_argument("--input-dir", default=None)
    parser.add_argument("--window-sec", type=float, default=5.0)
    parser.add_argument("--sr", type=int, default=250)
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)

    if args.generate_synthetic:
        kinds = ["normal", "st_elevation", "afib", "tachy"]
        labels = []
        for i in range(args.n_samples):
            kind = np.random.choice(kinds, p=[0.45, 0.2, 0.2, 0.15])
            sig = generate_synthetic(duration_sec=args.duration, sr=args.sampling_rate, kind=kind)
            fname = os.path.join(args.out, f"sample_{i}_{kind}.npy")
            np.save(fname, sig.astype(np.float32))
            labels.append({"file": fname, "label": kind})

        with open(os.path.join(args.out, "labels.json"), "w") as f:
            json.dump(labels, f)

        print(f"Generated {args.n_samples} synthetic samples in {args.out}")
        return

    input_dir = args.input_dir
    assert input_dir, "--input-dir is required when not generating synthetic"

    labels_path = os.path.join(input_dir, "labels.json")
    labels_map = {}
    if os.path.exists(labels_path):
        with open(labels_path, "r") as f:
            labels = json.load(f)
            for item in labels:
                # prefer 'file' as full path or 'filename' as basename
                if "file" in item and os.path.isabs(item["file"]):
                    key = item["file"]
                else:
                    key = os.path.join(input_dir, item["filename"]) if "filename" in item else os.path.join(input_dir, item.get("file", ""))
                key = key.replace("\\", "/")
                labels_map[key] = item["label"]

    X_list = []
    y_list = []
    label_to_idx = {"normal": 0, "st_elevation": 1, "afib": 2, "tachy": 3}

    for fname in sorted(os.listdir(input_dir)):
        if not fname.endswith(".npy"):
            continue
        path = os.path.join(input_dir, fname)
        sig = np.load(path)
        # Preprocess
        sig = bandpass(sig, 0.5, 40, args.sr, order=3)
        sig = normalize(sig)
        # windows
        windows = create_windows(sig, args.sr, window_sec=args.window_sec)
        for w in windows:
            X_list.append(w.astype(np.float32))
            label = labels_map.get(path, "normal")
            y = np.zeros(len(label_to_idx), dtype=np.float32)
            y[label_to_idx[label]] = 1.0
            y_list.append(y)

    X = np.stack(X_list)
    y = np.stack(y_list)

    os.makedirs(args.out, exist_ok=True)
    np.save(os.path.join(args.out, "X.npy"), X)
    np.save(os.path.join(args.out, "y.npy"), y)

    print(f"Processed dataset: X.shape={X.shape}, y.shape={y.shape} -> {args.out}")


if __name__ == "__main__":
    main()
