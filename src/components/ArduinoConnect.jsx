import { useRef, useState } from "react";
import { pushECGValue } from "../hooks/useECGStream";
const decoder = new TextDecoder();

export default function ArduinoConnect() {
  const [data, setData] = useState("No data yet");
  const [status, setStatus] = useState("disconnected"); // disconnected | connecting | connected | error
  const [error, setError] = useState(null);

  const portRef = useRef(null);
  const readerRef = useRef(null);

  const connect = async () => {
    setError(null);
    setStatus("connecting");
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      portRef.current = port;
      setStatus("connected");

      const reader = port.readable.getReader();
      readerRef.current = reader;

      while (port.readable) {
        const { value, done } = await reader.read();
        if (done) {
          reader.releaseLock();
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        lines.forEach((line) => {
          const clean = line.trim();
          try {
            const json = JSON.parse(clean);
            if (json && typeof json.ecg === "number") {
              setData(String(json.ecg));
              pushECGValue(json.ecg);
            } else if (!isNaN(Number(clean))) {
              const n = Number(clean);
              setData(String(n));
              pushECGValue(n);
            }
          } catch (e) {
            // Ignore non-JSON lines
          }
        });
      }
    } catch (err) {
      console.error(err);
      setError(String(err?.message ?? err));
      setStatus("error");
    }
  };

  const disconnect = async () => {
    try {
      setStatus("disconnected");
      if (readerRef.current) {
        try {
          await readerRef.current.cancel();
        } catch (_) {}
        readerRef.current.releaseLock();
        readerRef.current = null;
      }
      if (portRef.current) {
        try {
          await portRef.current.close();
        } catch (_) {}
        portRef.current = null;
      }
    } catch (err) {
      console.warn(err);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <button
          onClick={connect}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-60"
          disabled={status === "connecting" || status === "connected"}
          aria-pressed={status === "connected"}
        >
          {status === "connecting" ? "Connecting…" : status === "connected" ? "Connected" : "Connect Arduino"}
        </button>

        <button
          onClick={disconnect}
          className="px-4 py-2 bg-gray-700 text-white rounded"
          disabled={status !== "connected"}
        >
          Disconnect
        </button>

        <div className="ml-auto text-sm text-foreground/70">Status: <span className="font-medium" aria-live="polite">{status}</span></div>
      </div>

      {error && <div className="mt-2 text-sm text-red-400" role="alert">Error: {String(error)}</div>}

      <div className="mt-4 text-xl" aria-live="polite">Data: {data}</div>

      <div className="mt-2 text-xs text-foreground/60">Tip: Use JSON lines like {`{"ecg": 345}`} or raw numeric values per line.</div>
    </div>
  );
}