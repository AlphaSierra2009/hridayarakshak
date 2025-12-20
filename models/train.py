"""Train a small 1D-CNN on processed ECG windows.

Usage:
  python models/train.py --data data/processed --epochs 5 --batch 16
"""

import argparse
import os
import numpy as np
try:
    from tqdm import tqdm
except Exception:
    tqdm = lambda x: x
import torch
from torch.utils.data import DataLoader, TensorDataset
import torch.nn as nn
import torch.optim as optim
from sklearn.model_selection import train_test_split
from sklearn.metrics import precision_recall_fscore_support, roc_auc_score
from models.utils import SimpleECGNet
try:
    from torch.utils.tensorboard import SummaryWriter
except Exception:
    SummaryWriter = None

try:
    import wandb
except Exception:
    wandb = None


def train_one_epoch(model, loader, opt, loss_fn, device):
    model.train()
    total = 0
    running_loss = 0.0
    for X, y in loader:
        X = X.to(device)
        y = y.to(device)
        opt.zero_grad()
        out = model(X)
        loss = loss_fn(out, y)
        loss.backward()
        opt.step()
        running_loss += loss.item() * X.shape[0]
        total += X.shape[0]
    return running_loss / total


def eval_model(model, loader, device):
    model.eval()
    ys = []
    y_scores = []
    with torch.no_grad():
        for X, y in loader:
            X = X.to(device)
            out = model(X)
            probs = torch.sigmoid(out).cpu().numpy()
            y_scores.append(probs)
            ys.append(y.numpy())
    if len(ys) == 0:
        return {"accuracy": 0.0}
    y_scores = np.vstack(y_scores)
    ys = np.vstack(ys)
    preds = (y_scores > 0.5).astype(int)
    acc = (preds == ys).all(axis=1).mean()
    precision, recall, f1, _ = precision_recall_fscore_support(ys, preds, average=None, zero_division=0)
    # try ROC AUC per class if possible
    aucs = []
    for i in range(ys.shape[1]):
        try:
            aucs.append(float(roc_auc_score(ys[:, i], y_scores[:, i])))
        except Exception:
            aucs.append(float('nan'))
    return {"accuracy": float(acc), "precision": precision.tolist(), "recall": recall.tolist(), "f1": f1.tolist(), "aucs": aucs}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/processed")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--save", default="models/checkpoint.pt")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--log-dir", default=None)
    parser.add_argument("--use-wandb", action="store_true")
    parser.add_argument("--project", default="ecg-model")
    args = parser.parse_args()

    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    X = np.load(os.path.join(args.data, "X.npy"))  # (N, time)
    y = np.load(os.path.join(args.data, "y.npy"))  # (N, classes)

    # split
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=args.seed)

    # to tensors
    X_train_t = torch.from_numpy(X_train).float()
    y_train_t = torch.from_numpy(y_train).float()
    X_val_t = torch.from_numpy(X_val).float()
    y_val_t = torch.from_numpy(y_val).float()

    # datasets and loaders
    train_ds = TensorDataset(X_train_t, y_train_t)
    val_ds = TensorDataset(X_val_t, y_val_t)

    train_loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    writer = None
    if args.log_dir and SummaryWriter is not None:
        os.makedirs(args.log_dir, exist_ok=True)
        writer = SummaryWriter(log_dir=args.log_dir)
    if args.use_wandb:
        if wandb is None:
            print("wandb not installed; install with `pip install wandb` to use it")
        else:
            wandb.init(project=args.project, config=vars(args))

    model = SimpleECGNet(in_channels=1, n_classes=y.shape[1]).to(device)
    loss_fn = nn.BCEWithLogitsLoss()
    opt = optim.Adam(model.parameters(), lr=args.lr)

    os.makedirs(os.path.dirname(args.save), exist_ok=True)

    best_acc = 0.0
    for epoch in range(1, args.epochs + 1):
        train_loss = train_one_epoch(model, train_loader, opt, loss_fn, device)
        metrics = eval_model(model, val_loader, device)
        val_acc = metrics.get("accuracy", 0.0)
        print(f"Epoch {epoch}/{args.epochs}: train_loss={train_loss:.4f} val_acc={val_acc:.3f}")
        # log
        if writer is not None:
            writer.add_scalar("train/loss", train_loss, epoch)
            writer.add_scalar("val/accuracy", val_acc, epoch)
            for i, (p, r, f) in enumerate(zip(metrics.get("precision", []), metrics.get("recall", []), metrics.get("f1", []))):
                writer.add_scalar(f"val/class_{i}/precision", p, epoch)
                writer.add_scalar(f"val/class_{i}/recall", r, epoch)
                writer.add_scalar(f"val/class_{i}/f1", f, epoch)
        if args.use_wandb and wandb is not None:
            log = {"train/loss": train_loss, "val/accuracy": val_acc}
            for i, (p, r, f) in enumerate(zip(metrics.get("precision", []), metrics.get("recall", []), metrics.get("f1", []))):
                log.update({f"val/class_{i}/precision": p, f"val/class_{i}/recall": r, f"val/class_{i}/f1": f})
            wandb.log(log, step=epoch)
        if val_acc > best_acc:
            best_acc = val_acc
            torch.save(model.state_dict(), args.save)

    print("Training finished. Best val acc:", best_acc)
    if writer is not None:
        writer.close()
    if args.use_wandb and wandb is not None:
        wandb.finish()


if __name__ == "__main__":
    main()
