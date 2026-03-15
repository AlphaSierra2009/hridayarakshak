import { useCallback, useEffect, useRef, useState } from "react";

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

interface UseWirelessECGReturn {
  state: ConnectionState;
  connect: (ip?: string) => void;
  disconnect: () => void;
  lastError?: string | null;
}

const DEFAULT_PORT = 81;
const DEFAULT_RECONNECT_BASE = 1000; // ms
const MAX_RECONNECT_DELAY = 30_000; // ms

export default function useWirelessECG(initialIp?: string): UseWirelessECGReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const mounted = useRef(true);
  const currentIp = useRef<string | undefined>(initialIp);

  const [state, setState] = useState<ConnectionState>("disconnected");
  const [lastError, setLastError] = useState<string | null>(null);

  const clearReconnect = useCallback(() => {
    if (reconnectTimer.current) {
      window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    reconnectAttempts.current = 0;
  }, []);

  const safeDispatch = useCallback((value: number) => {
    try {
      const ev = new CustomEvent("ecgData", { detail: value });
      window.dispatchEvent(ev);
    } catch (e) {
      // intentionally silent to avoid console spam
    }
  }, []);

  const handleMessage = useCallback((msg: MessageEvent) => {
    // Support both text and binary payloads. The ESP32 firmware sends raw integer samples as binary (int16 little-endian) by default.
    const data = msg.data;

    const processNumber = (n: number | null) => {
      if (n !== null && Number.isFinite(n)) safeDispatch(n);
    };

    if (typeof data === "string") {
      const raw = data.trim();
      if (!raw) return;
      let num: number | null = null;
      try {
        const p = Number(raw);
        if (Number.isFinite(p)) num = p;
        else {
          const cleaned = raw.replace(/[^0-9eE+\-.]/g, "");
          const p2 = Number(cleaned);
          if (Number.isFinite(p2)) num = p2;
        }
      } catch (e) {
        num = null;
      }
      processNumber(num);
      return;
    }

    // Binary types: ArrayBuffer or Blob
    const handleArrayBuffer = (buf: ArrayBuffer) => {
      if (!buf || buf.byteLength === 0) return;
      try {
        const dv = new DataView(buf);
        // If length is 2, interpret as int16; if 4, int32; otherwise attempt int16 from first two bytes
        if (dv.byteLength >= 2) {
          const val = dv.getInt16(0, true);
          processNumber(val);
          return;
        }
      } catch (e) {
        // ignore parsing errors
      }
    };

    if (data instanceof ArrayBuffer) {
      handleArrayBuffer(data);
      return;
    }

    // Blob (browser may deliver Blob). Convert then process.
    if (data instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => {
        const buf = reader.result as ArrayBuffer | null;
        if (buf) handleArrayBuffer(buf);
      };
      reader.onerror = () => {
        /* ignore */
      };
      reader.readAsArrayBuffer(data);
      return;
    }

    // Fallback: try to coerce to string and parse
    try {
      const txt = String(data).trim();
      if (txt) {
        const p = Number(txt.replace(/[^0-9eE+\-.]/g, ""));
        if (Number.isFinite(p)) processNumber(p);
      }
    } catch (e) {}
  }, [safeDispatch]);

  const connect = useCallback((ip?: string) => {
    if (ip) currentIp.current = ip;
    const ipToUse = currentIp.current;
    if (!ipToUse) {
      setLastError("No ESP32 IP provided");
      setState("error");
      return;
    }

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setState("connecting");
    setLastError(null);

    try {
      const url = `ws://${ipToUse}:${DEFAULT_PORT}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (!mounted.current) return;
        reconnectAttempts.current = 0;
        setState("connected");
        clearReconnect();
        try {
          // persist successful IP for convenience
          if (ipToUse) window.localStorage.setItem('esp32:lastIP', ipToUse);
        } catch (e) {
          // ignore storage errors
        }
      });

      ws.addEventListener("message", handleMessage as any);

      ws.addEventListener("close", () => {
        if (!mounted.current) return;
        setState("disconnected");
        reconnectAttempts.current += 1;
        const jitter = Math.random() * 300;
        const delay = Math.min(MAX_RECONNECT_DELAY, DEFAULT_RECONNECT_BASE * Math.pow(1.8, reconnectAttempts.current) + jitter);
        reconnectTimer.current = window.setTimeout(() => {
          if (mounted.current) connect();
        }, delay) as unknown as number;
      });

      ws.addEventListener("error", () => {
        if (!mounted.current) return;
        setState("error");
        setLastError("WebSocket error");
        try { ws.close(); } catch {};
      });
    } catch (e) {
      setState("error");
      setLastError(String(e instanceof Error ? e.message : "Failed to connect"));
    }
  }, [clearReconnect, handleMessage]);

  const disconnect = useCallback(() => {
    clearReconnect();
    setState("disconnected");
    try {
      if (wsRef.current) {
        wsRef.current.removeEventListener("message", handleMessage as any);
        wsRef.current.close();
      }
    } catch (e) {}
    wsRef.current = null;
  }, [clearReconnect, handleMessage]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearReconnect();
      try {
        if (wsRef.current) {
          wsRef.current.removeEventListener("message", handleMessage as any);
          wsRef.current.close();
        }
      } catch (e) {}
      wsRef.current = null;
    };
  }, [clearReconnect, handleMessage]);

  return { state, connect, disconnect, lastError };
}
