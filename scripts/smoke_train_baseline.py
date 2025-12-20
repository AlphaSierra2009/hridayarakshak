"""Pure-numpy baseline classifier to validate dataset without external packages.
Computes simple features and trains a nearest-centroid classifier.
"""
import numpy as np


def extract_features(X):
    feats = []
    for x in X:
        mean = float(x.mean())
        std = float(x.std())
        mn = float(x.min())
        mx = float(x.max())
        rng = mx - mn
        peaks = 0
        for i in range(1, len(x)-1):
            if x[i] > x[i-1] and x[i] > x[i+1] and x[i] > (mean + 0.5*std):
                peaks += 1
        feats.append([mean, std, mn, mx, rng, peaks])
    return np.array(feats)


def train_test_split_indices(n, test_fraction=0.2, seed=42):
    rng = np.random.RandomState(seed)
    idx = np.arange(n)
    rng.shuffle(idx)
    cutoff = int(n * (1 - test_fraction))
    return idx[:cutoff], idx[cutoff:]


def classification_report_simple(y_true, y_pred):
    classes = np.unique(y_true)
    out = {}
    for c in classes:
        tp = np.sum((y_pred == c) & (y_true == c))
        fp = np.sum((y_pred == c) & (y_true != c))
        fn = np.sum((y_pred != c) & (y_true == c))
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0
        out[int(c)] = dict(precision=prec, recall=rec, f1=f1, support=int(np.sum(y_true==c)))
    return out


def main():
    X = np.load('data/processed/X.npy')
    y = np.load('data/processed/y.npy')
    y_cls = np.argmax(y, axis=1)

    feats = extract_features(X)
    n = len(feats)
    tr_idx, te_idx = train_test_split_indices(n, test_fraction=0.2)

    X_tr, X_te = feats[tr_idx], feats[te_idx]
    y_tr, y_te = y_cls[tr_idx], y_cls[te_idx]

    # train nearest centroid
    classes = np.unique(y_tr)
    centroids = {c: X_tr[y_tr == c].mean(axis=0) for c in classes}

    def predict(Xs):
        preds = []
        for x in Xs:
            d = [np.linalg.norm(x - centroids[c]) for c in classes]
            preds.append(classes[np.argmin(d)])
        return np.array(preds)

    y_pred = predict(X_te)
    report = classification_report_simple(y_te, y_pred)

    acc = (y_pred == y_te).mean()
    print(f'Baseline nearest-centroid accuracy: {acc:.3f}')
    print('Per-class report:')
    for k, v in report.items():
        print(k, v)

if __name__ == '__main__':
    main()
