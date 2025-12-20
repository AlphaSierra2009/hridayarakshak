"""Simple data loaders for EDF, WFDB and CSV/NumPy ECG recordings.

Utilities:
- load_edf(path) -> {'signal': np.ndarray, 'sr': int, 'meta': dict}
- load_wfdb(path) -> same
- load_record_generic(path) -> picks loader based on extension
- load_dataset_from_dir(dir, labels_file='labels.json') -> list of samples
- patient_split(samples, train_frac=0.8, seed=42) -> (train, val)
"""
from typing import Dict, List, Tuple
import json
import os
import numpy as np


def load_numpy(path: str) -> Dict:
    arr = np.load(path)
    return {"signal": np.asarray(arr).astype(float), "sr": None, "meta": {"source": path}}


def load_csv(path: str) -> Dict:
    """Load generic CSVs. If two columns present and first is monotonic, treat as (time, value)."""
    data = np.genfromtxt(path, delimiter=',')
    if data.ndim == 1:
        values = data.astype(float)
        return {"signal": values, "sr": None, "meta": {"source": path}}
    # multi-column
    c0 = data[:, 0]
    if np.all(np.diff(c0) >= 0):
        # likely (time, value)
        times = c0.astype(float)
        values = data[:, 1].astype(float)
        median_dt = float(np.median(np.diff(times))) if len(times) > 1 else None
        sr = 1.0 / median_dt if median_dt and median_dt > 0 else None
        return {"signal": values, "sr": sr, "meta": {"source": path, "time_column_inferred": True}}
    # fallback: take first column as values
    values = data[:, 0].astype(float)
    return {"signal": values, "sr": None, "meta": {"source": path}}


def load_edf(path: str) -> Dict:
    try:
        import pyedflib
    except Exception as e:
        raise RuntimeError("pyedflib is required to load EDF files. Install with `pip install pyedflib`") from e

    f = pyedflib.EdfReader(path)
    n = f.signals_in_file
    sigs = [f.readSignal(i) for i in range(n)]
    # stack if multi-lead, take first lead by default
    sig = np.asarray(sigs[0]) if n >= 1 else np.asarray(sigs)
    sr = int(f.getSampleFrequency(0)) if n >= 1 else None
    meta = {"channels": n, "labels": f.getSignalLabels()}
    f._close()
    del f
    return {"signal": sig.astype(float), "sr": sr, "meta": meta}


def load_wfdb(path: str) -> Dict:
    try:
        import wfdb
    except Exception as e:
        raise RuntimeError("wfdb is required to load WFDB records. Install with `pip install wfdb`") from e

    # path should be a record name (without extension) or path to record
    record = wfdb.rdrecord(path)
    sig = record.p_signal
    sr = record.fs
    meta = {"channels": sig.shape[1] if sig.ndim > 1 else 1, "comments": record.comments}
    # take first channel by default
    if sig.ndim > 1:
        sig = sig[:, 0]
    return {"signal": np.asarray(sig).astype(float), "sr": int(sr), "meta": meta}


def load_record_generic(path: str) -> Dict:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".npy":
        return load_numpy(path)
    if ext == ".csv":
        return load_csv(path)
    if ext == ".edf":
        return load_edf(path)
    # wfdb often uses a record name without extension, caller should use load_wfdb
    raise ValueError(f"Unsupported extension: {ext}")


def load_dataset_from_dir(directory: str, labels_file: str = "labels.json") -> List[Dict]:
    labels_path = os.path.join(directory, labels_file)
    if not os.path.exists(labels_path):
        # fallback: load all .npy and .csv files and mark as unlabeled
        records = []
        for fname in os.listdir(directory):
            if fname.endswith(".npy") or fname.endswith(".csv") or fname.endswith(".edf"):
                rec = load_record_generic(os.path.join(directory, fname))
                rec["filename"] = fname
                rec["label"] = None
                records.append(rec)
        return records

    mapping = json.load(open(labels_path))
    samples = []
    for entry in mapping:
        fname = entry.get("file") or entry.get("filename")
        label = entry.get("label")
        patient = entry.get("patient_id")
        p = os.path.join(directory, fname)
        if fname.endswith(".dat") or fname.endswith(".hea"):
            # wfdb record base name
            rec = load_wfdb(os.path.splitext(p)[0])
        else:
            rec = load_record_generic(p)
        rec["filename"] = fname
        rec["label"] = label
        rec["patient_id"] = patient
        samples.append(rec)
    return samples


def patient_split(samples: List[Dict], train_frac: float = 0.8, seed: int = 42) -> Tuple[List[Dict], List[Dict]]:
    # group by patient_id (if present), otherwise by filename prefix
    from collections import defaultdict
    groups = defaultdict(list)
    for s in samples:
        pid = s.get("patient_id") or s.get("filename") or "unknown"
        groups[pid].append(s)
    keys = list(groups.keys())
    rng = __import__('random')
    rng.seed(seed)
    rng.shuffle(keys)
    cutoff = int(len(keys) * train_frac)
    train_keys = set(keys[:cutoff])
    train = [rec for k in train_keys for rec in groups[k]]
    val = [rec for k in keys[cutoff:] for rec in groups[k]]
    return train, val
