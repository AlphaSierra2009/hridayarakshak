"""Convert an Arduino serial CSV (raw ADC values or timestamp,value) into a .npy time-series and metadata.

Usage examples:
  python scripts/convert_serial_csv.py --input data/raw/serial_001.csv --out data/raw --sr 250
  python scripts/convert_serial_csv.py --input data/raw/serial_001.csv --out data/raw --time-col 0 --value-col 1

Outputs:
 - <out>/<basename>.npy  (1-D float array)
 - <out>/<basename>.meta.json
 - <out>/<basename>_preview.png (small plot for quick sanity check)

If sampling rate is not provided and no time column is present, defaults to 250 Hz; prefer to pass the known sampling rate.
"""

from __future__ import annotations
import argparse
import json
import os
from typing import Optional

import numpy as np


def convert_csv(input_path: str, out_dir: str, sr: Optional[float] = None, time_col: Optional[int] = None, value_col: int = 0, skiprows: int = 0, scale: Optional[float] = None):
    os.makedirs(out_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(input_path))[0]
    # try to load flexibly
    try:
        data = np.genfromtxt(input_path, delimiter=',', skip_header=skiprows)
        if data.ndim == 1:
            # single column
            if time_col is not None and value_col is not None and time_col != value_col:
                raise ValueError("single-column CSV cannot have separate time and value columns")
            values = data.astype(float)
            times = None
        else:
            # multi-column
            if time_col is not None:
                times = data[:, time_col].astype(float)
            else:
                # detect if first column looks like time (monotonic increasing)
                c0 = data[:, 0]
                if np.all(np.diff(c0) >= 0):
                    times = c0.astype(float)
                else:
                    times = None
            values = data[:, value_col].astype(float)
    except ValueError:
        # fallback: robust line-by-line parse for mixed formats
        times_list = []
        vals_list = []
        with open(input_path, 'r') as f:
            for ln in f:
                s = ln.strip()
                if not s:
                    continue
                parts = [p.strip() for p in s.split(',') if p.strip() != '']
                nums = []
                for p in parts:
                    try:
                        nums.append(float(p))
                    except Exception:
                        # skip non-numeric tokens
                        pass
                if len(nums) >= 2:
                    # assume (time, value) or (value, other); prefer (time, value)
                    times_list.append(nums[0])
                    vals_list.append(nums[1])
                elif len(nums) == 1:
                    vals_list.append(nums[0])
                else:
                    # no numeric content; skip
                    continue
        if len(vals_list) == 0:
            raise ValueError("No numeric values found in CSV")
        values = np.asarray(vals_list, dtype=float)
        if len(times_list) >= len(vals_list):
            times = np.asarray(times_list[: len(vals_list)], dtype=float)
        elif len(times_list) > 0:
            # if time list shorter, attempt to interpolate or infer
            times = np.asarray(times_list, dtype=float)
        else:
            times = None

    if scale is not None:
        values = values * float(scale)

    inferred_sr = sr
    duration = None
    if times is not None:
        # compute median diff and robustly interpret units (seconds vs milliseconds vs index)
        diffs = np.diff(times)
        median_dt = float(np.median(diffs))
        if median_dt <= 0:
            raise ValueError("Non-positive time differences detected in time column")

        # Detect sample-index sequences (1,2,3,...) where median_dt==1 and values large -> treat as indices
        if np.allclose(diffs, 1.0) and times.max() > 1000:
            # likely an index column, not timestamps; fall back to no time info
            times = None
            inferred_sr = None
            duration = len(values) / (inferred_sr if inferred_sr is not None else 250.0)
        else:
            # If median_dt seems like milliseconds (large ints), convert to seconds
            if median_dt > 1.5:
                # if values look like unix ms or ms timestamps
                if times.max() > 1e3:
                    median_dt_sec = median_dt / 1000.0
                    inferred_sr = 1.0 / median_dt_sec
                    # convert times to seconds for duration calc
                    duration = float((times[-1] - times[0]) / 1000.0)
                else:
                    # unusually large dt but not ms-like: set inferred_sr to None and fallback later
                    inferred_sr = None
                    duration = float(times[-1] - times[0])
            else:
                # normal case: times in seconds (or fractions)
                inferred_sr = 1.0 / median_dt
                duration = float(times[-1] - times[0])
    else:
        if inferred_sr is None:
            inferred_sr = 250.0
        duration = len(values) / inferred_sr

    # resample to target sr (if given and different) - for now we just save at inferred_sr
    out_npy = os.path.join(out_dir, f"{base}.npy")
    out_meta = os.path.join(out_dir, f"{base}.meta.json")
    np.save(out_npy, values.astype(float))

    meta = {
        "source": input_path,
        "n_samples": int(len(values)),
        "sampling_rate": float(inferred_sr),
        "duration_seconds": duration,
        "scale_applied": float(scale) if scale is not None else None,
    }

    with open(out_meta, 'w') as f:
        json.dump(meta, f, indent=2)

    # preview plot
    try:
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(8, 2))
        t = np.arange(len(values)) / inferred_sr
        ax.plot(t, values, lw=0.8)
        ax.set_xlabel('time (s)')
        ax.set_ylabel('value')
        ax.set_title(base)
        plt.tight_layout()
        preview = os.path.join(out_dir, f"{base}_preview.png")
        fig.savefig(preview, dpi=150)
        plt.close(fig)
        print("Saved preview to", preview)
    except Exception:
        print("matplotlib not available; skipping preview image")

    print("Wrote:", out_npy, "and", out_meta)
    return out_npy, out_meta


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--out', default='data/raw')
    parser.add_argument('--sr', type=float, default=None, help='sampling rate (Hz)')
    parser.add_argument('--time-col', type=int, default=None, help='column index for time (0-based)')
    parser.add_argument('--value-col', type=int, default=0, help='column index for values (0-based)')
    parser.add_argument('--skiprows', type=int, default=0)
    parser.add_argument('--scale', type=float, default=None, help='multiply values by this factor (e.g., ADC->mV)')
    args = parser.parse_args()
    convert_csv(args.input, args.out, sr=args.sr, time_col=args.time_col, value_col=args.value_col, skiprows=args.skiprows, scale=args.scale)


if __name__ == '__main__':
    main()
