#!/usr/bin/env bash
set -euo pipefail
python data/prepare_dataset.py --generate-synthetic --out data/raw --n-samples 30 --duration 10 --sampling-rate 250
python data/prepare_dataset.py --input-dir data/raw --out data/processed --window-sec 5 --sr 250
python models/train.py --data data/processed --epochs 3 --batch 8 --save models/checkpoint_smoke.pt

echo "Smoke training finished. Check models/checkpoint_smoke.pt"