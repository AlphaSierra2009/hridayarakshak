import os
import json
import numpy as np
from data.loaders import load_dataset_from_dir, patient_split

def test_load_and_split(tmp_path):
    # create two npy files and labels
    a = np.sin(np.linspace(0, 10, 500))
    b = np.cos(np.linspace(0, 10, 500))
    np.save(tmp_path / 'a.npy', a)
    np.save(tmp_path / 'b.npy', b)
    mapping = [
        {"file": "a.npy", "label": "normal", "patient_id": "p1"},
        {"file": "b.npy", "label": "st_elevation", "patient_id": "p2"}
    ]
    with open(tmp_path / 'labels.json', 'w') as f:
        json.dump(mapping, f)

    samples = load_dataset_from_dir(str(tmp_path))
    assert len(samples) == 2
    tr, val = patient_split(samples, train_frac=0.5, seed=1)
    assert len(tr) + len(val) == 2
