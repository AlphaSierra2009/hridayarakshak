"""Convert a trained PyTorch checkpoint to ONNX and run a quick runtime check with onnxruntime."""
import os
import numpy as np
import torch
import onnx
import onnxruntime as ort
from models.utils import SimpleECGNet


def main():
    ckpt = "models/checkpoint_smoke.pt"
    if not os.path.exists(ckpt):
        raise FileNotFoundError("Checkpoint not found. Run smoke train first: scripts/smoke_train.sh")

    # load a sample input shape from processed data
    X = np.load("data/processed/X.npy")
    dummy = torch.from_numpy(X[:1]).float()  # (1, time)

    model = SimpleECGNet(in_channels=1, n_classes=3)
    model.load_state_dict(torch.load(ckpt, map_location="cpu"))
    model.eval()

    # export
    onnx_path = "models/model.onnx"
    torch.onnx.export(
        model,
        dummy,
        onnx_path,
        opset_version=13,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
    )
    print("Saved ONNX to", onnx_path)

    # simple runtime check
    sess = ort.InferenceSession(onnx_path)
    inp = {sess.get_inputs()[0].name: X[:2].astype(np.float32)}
    out = sess.run(None, inp)
    print("ONNX runtime output shapes:", [o.shape for o in out])

if __name__ == "__main__":
    main()
