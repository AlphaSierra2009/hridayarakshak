"""Lightweight smoke training using scikit-learn to validate dataset and labels without PyTorch.

Outputs simple classification metrics (accuracy, per-class precision/recall).
"""
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report


def extract_features(X, sr):
    feats = []
    for x in X:
        mean = float(x.mean())
        std = float(x.std())
        mn = float(x.min())
        mx = float(x.max())
        rng = mx - mn
        # simple peak count
        peaks = 0
        for i in range(1, len(x)-1):
            if x[i] > x[i-1] and x[i] > x[i+1] and x[i] > (mean + 0.5*std):
                peaks += 1
        feats.append([mean, std, mn, mx, rng, peaks])
    return np.array(feats)


def main():
    X = np.load('data/processed/X.npy')
    y = np.load('data/processed/y.npy')
    sr = 24
    y_cls = np.argmax(y, axis=1)

    feats = extract_features(X, sr)
    X_train, X_test, y_train, y_test = train_test_split(feats, y_cls, test_size=0.2, random_state=42, stratify=y_cls)

    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train, y_train)
    pred = clf.predict(X_test)
    print(classification_report(y_test, pred))

if __name__ == '__main__':
    main()
