"""
Simple utility to generate a matplotlib PNG from a CSV of ECG samples.
Usage:
  python scripts/generate_alert_plot.py path/to/alert_123_reading.csv --output alert_123_plot.png

This is intended to be run locally for creating a figure to show to judges.
"""
import argparse
import matplotlib.pyplot as plt
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('csv', help='CSV file with one sample per line')
parser.add_argument('--output', '-o', default='plot.png')
parser.add_argument('--title', '-t', default='ECG Reading')

args = parser.parse_args()

data = np.loadtxt(args.csv)
plt.figure(figsize=(10,3))
plt.plot(data, linewidth=1)
plt.title(args.title)
plt.xlabel('Sample')
plt.ylabel('Amplitude')
plt.grid(True, alpha=0.4)
plt.tight_layout()
plt.savefig(args.output)
print(f'Saved plot to {args.output}')