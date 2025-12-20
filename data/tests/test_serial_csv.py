import os
import numpy as np
from scripts.convert_serial_csv import convert_csv


def test_convert_csv(tmp_path):
    # create a simple 2-column (time, value) CSV
    t = np.linspace(0, 1, 100)
    v = np.sin(2 * np.pi * 5 * t)
    data = np.vstack([t, v]).T
    p = tmp_path / 's.csv'
    np.savetxt(p, data, delimiter=',')

    out_dir = tmp_path / 'out'
    out_dir.mkdir()
    npy, meta = convert_csv(str(p), str(out_dir), sr=None, time_col=0, value_col=1)
    assert os.path.exists(npy)
    assert os.path.exists(meta)
    arr = np.load(npy)
    assert arr.shape[0] == 100
    m = __import__('json').load(open(meta))
    assert 'sampling_rate' in m and m['sampling_rate'] > 0
