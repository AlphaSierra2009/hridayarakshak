"""Automatically window and label a single-channel ECG time series using heuristics.

Produces window files in the same directory and a labels.json (with "filename" keys) mapping windows to labels.

Heuristics (per-window):
 - ST-elevation if window mean > global mean + 0.5*global_std
 - AF-like if RR std / RR mean > 0.25
 - Tachy if BPM > 100
 - Else normal

Usage:
  python scripts/auto_label.py --input data/raw/ecg_data.npy --sr 24.39 --window-sec 5 --out-dir data/raw
"""

import argparse
import os
import json
import numpy as np


def detect_peaks_simple(sig, sr, min_distance_s=0.35, threshold_rel=0.5):
    # local maxima above mean + threshold_rel * std, separated by min_distance_s
    mean = sig.mean()
    std = sig.std()
    thresh = mean + threshold_rel * std
    min_dist = int(sr * min_distance_s)
    peaks = []
    for i in range(1, len(sig) - 1):
        if sig[i] > sig[i - 1] and sig[i] > sig[i + 1] and sig[i] > thresh:
            if len(peaks) == 0 or (i - peaks[-1]) >= min_dist:
                peaks.append(i)
    return np.array(peaks)


def label_window(seg, sr, global_mean, global_std):
    peaks = detect_peaks_simple(seg, sr)
    bpm = None
    rr = None
    rr_var = None
    if len(peaks) >= 2:
        rr = np.diff(peaks) / sr
        rr_mean = rr.mean()
        rr_std = rr.std()
        rr_var = rr_std / (rr_mean + 1e-9)
        bpm = 60.0 / rr_mean if rr_mean > 0 else None

    st_offset = seg.mean() - global_mean

    # prioritise ST elevation
    if st_offset > 0.5 * global_std:
        return "st_elevation", dict(bpm=bpm, rr_var=rr_var, st_offset=st_offset, n_peaks=len(peaks))
    if rr_var is not None and rr_var > 0.25:
        return "afib", dict(bpm=bpm, rr_var=rr_var, st_offset=st_offset, n_peaks=len(peaks))
    if bpm is not None and bpm > 100:
        return "tachy", dict(bpm=bpm, rr_var=rr_var, st_offset=st_offset, n_peaks=len(peaks))
    return "normal", dict(bpm=bpm, rr_var=rr_var, st_offset=st_offset, n_peaks=len(peaks))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--sr", type=float, default=None)
    parser.add_argument("--window-sec", type=float, default=5.0)
    parser.add_argument("--out-dir", default=None)
    parser.add_argument("--patient-id", default=None)
    args = parser.parse_args()

    arr = np.load(args.input)
    dirn = args.out_dir or os.path.dirname(args.input)
    os.makedirs(dirn, exist_ok=True)

    # try to read meta
    base = os.path.splitext(os.path.basename(args.input))[0]
    meta_path = os.path.join(os.path.dirname(args.input), base + '.meta.json')
    if args.sr is None and os.path.exists(meta_path):
        m = json.load(open(meta_path))
        args.sr = m.get('sampling_rate', None)

    if args.sr is None:
        args.sr = 250.0

    sr = float(args.sr)
    step = int(args.window_sec * sr)

    global_mean = float(arr.mean())
    global_std = float(arr.std())

    labels = []
    details = {}
    win_idx = 0
    for i in range(0, len(arr) - step + 1, step):
        seg = arr[i : i + step]
        label, info = label_window(seg, sr, global_mean, global_std)
        fname = f"{base}_win_{win_idx:04d}.npy"
        np.save(os.path.join(dirn, fname), seg.astype(np.float32))
        entry = {"filename": fname, "label": label}
        if args.patient_id:
            entry["patient_id"] = args.patient_id
        labels.append(entry)
        details[fname] = info
        win_idx += 1

    labels_path = os.path.join(dirn, "labels.json")
    with open(labels_path, "w") as f:
        json.dump(labels, f, indent=2)
    # save details for debug
    with open(os.path.join(dirn, f"{base}_label_details.json"), "w") as f:
        json.dump(details, f, indent=2)

    print(f"Created {win_idx} windows in {dirn} and wrote {labels_path}")


if __name__ == "__main__":
    main()
