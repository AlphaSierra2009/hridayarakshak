import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type ConnectionState = "Disconnected" | "Connecting" | "Connected";

interface ECGReading {
  id: string;
  reading_value: number;
  heart_rate?: number;
  st_elevation_detected: boolean;
  reading_timestamp: string;
  latitude?: number;
  longitude?: number;
}

interface UseBLEECGOptions {
  userId?: string; // optional user id for inserting into supabase
  maxLocalStore?: number; // how many readings to keep locally
  batchInsertMs?: number; // batching interval for supabase inserts
}

export const useBLEECG = (opts: UseBLEECGOptions = {}) => {
  const { userId, maxLocalStore = 2000, batchInsertMs = 1000 } = opts;

  const [connectionState, setConnectionState] = useState<ConnectionState>("Disconnected");
  const [readings, setReadings] = useState<ECGReading[]>([]);

  // internal refs
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const serverRef = useRef<BluetoothRemoteGATTServer | null>(null);
  const charRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const bufferRef = useRef<number[]>([]); // raw numeric samples waiting to be flushed to state
  const insertBufferRef = useRef<ECGReading[]>([]); // readings waiting to be inserted to supabase
  const rafScheduledRef = useRef(false);
  const disconnectedHandlerRef = useRef<() => void | null>(null);

  // sanity: Web Bluetooth only works on secure contexts
  const isWebBluetoothAvailable = typeof navigator !== "undefined" && !!(navigator as any).bluetooth;

  const flushBufferToState = useCallback(() => {
    rafScheduledRef.current = false;
    const buf = bufferRef.current.splice(0, bufferRef.current.length);
    if (buf.length === 0) return;

    const now = Date.now();
    const newReadings: ECGReading[] = buf.map((v, idx) => ({
      id: `ble-${now}-${idx}-${Math.floor(Math.random() * 1e6)}`,
      reading_value: v,
      st_elevation_detected: false,
      reading_timestamp: new Date().toISOString(),
    }));

    // Keep a bounded array to avoid memory growth
    setReadings((prev) => {
      const merged = prev.concat(newReadings);
      if (merged.length > maxLocalStore) return merged.slice(merged.length - maxLocalStore);
      return merged;
    });

    // push to insert buffer for batched supabase insertion
    insertBufferRef.current.push(...newReadings);
  }, [maxLocalStore]);

  // requestAnimationFrame based flusher to avoid re-render storms
  const scheduleFlush = useCallback(() => {
    if (rafScheduledRef.current) return;
    rafScheduledRef.current = true;
    requestAnimationFrame(flushBufferToState);
  }, [flushBufferToState]);

  // periodic batch insert to Supabase if configured and available
  useEffect(() => {
    let mounted = true;
    const timer = setInterval(async () => {
      if (!mounted) return;
      const batch = insertBufferRef.current.splice(0, insertBufferRef.current.length);
      if (batch.length === 0) return;

      // If supabase is a mock, skip network insert
      try {
        if (userId && supabase && (supabase as any).from) {
          // Insert with optional user_id column if present in DB schema
          const toInsert = batch.map((r) => ({
            id: r.id,
            reading_value: r.reading_value,
            reading_timestamp: r.reading_timestamp,
            st_elevation_detected: r.st_elevation_detected,
            user_id: userId,
          }));

          // best-effort insert, don't block UI
          const { error } = await supabase.from("ecg_readings").insert(toInsert);
          if (error) console.warn("BLE ECG insert error:", error);
        }
      } catch (e) {
        console.warn("BLE ECG batched insert failed", e);
      }
    }, batchInsertMs);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [batchInsertMs, userId]);

  // characteristic notification handler
  const handleNotification = useCallback((event: Event) => {
    try {
      const ev = event as Event & { target: any };
      const value: DataView = ev.target.value as DataView;
      if (!value || value.byteLength === 0) return;

      // Parse all little-endian uint16 values from the DataView
      for (let i = 0; i + 1 < value.byteLength; i += 2) {
        const sample = value.getUint16(i, true);
        bufferRef.current.push(sample);
      }

      scheduleFlush();
    } catch (err) {
      console.warn("Failed to parse BLE notification", err);
    }
  }, [scheduleFlush]);

  const connect = useCallback(async () => {
    if (!isWebBluetoothAvailable) throw new Error("Web Bluetooth is not available in this browser.");
    if (connectionState === "Connecting" || connectionState === "Connected") return;

    setConnectionState("Connecting");

    try {
      // request device by name and service UUID
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ name: "HRIDAYARAKSHAK-ECG" }],
        optionalServices: ["180D"],
      });

      deviceRef.current = device;

      // handle unexpected disconnects
      const onDisconnect = () => {
        setConnectionState("Disconnected");
        charRef.current = null;
        serverRef.current = null;
        // schedule a reconnect attempt in a few seconds
        setTimeout(() => {
          // noop: leave reconnect to user or UI
        }, 2000);
      };

      device.addEventListener("gattserverdisconnected", onDisconnect as any);
      disconnectedHandlerRef.current = onDisconnect;

      const server = await device.gatt.connect();
      serverRef.current = server;

      const service = await server.getPrimaryService("180D");
      const characteristic = await service.getCharacteristic("2A37");
      charRef.current = characteristic;

      await characteristic.startNotifications();
      characteristic.addEventListener("characteristicvaluechanged", handleNotification as any);

      setConnectionState("Connected");
    } catch (err) {
      console.warn("BLE connect failed", err);
      setConnectionState("Disconnected");
      throw err;
    }
  }, [handleNotification, isWebBluetoothAvailable, connectionState]);

  const disconnect = useCallback(async () => {
    try {
      if (charRef.current) {
        try {
          await charRef.current.stopNotifications();
        } catch (e) {
          // ignore
        }
        charRef.current.removeEventListener("characteristicvaluechanged", handleNotification as any);
        charRef.current = null;
      }

      if (serverRef.current && serverRef.current.connected) {
        serverRef.current.disconnect();
      }

      if (deviceRef.current && disconnectedHandlerRef.current) {
        try {
          deviceRef.current.removeEventListener("gattserverdisconnected", disconnectedHandlerRef.current as any);
        } catch (_) {}
      }

      deviceRef.current = null;
      serverRef.current = null;
      setConnectionState("Disconnected");
    } catch (err) {
      console.warn("BLE disconnect failed", err);
    }
  }, [handleNotification]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        disconnect();
      } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    connect,
    disconnect,
    connectionState,
    readings,
    isAvailable: isWebBluetoothAvailable,
  } as const;
};

export default useBLEECG;
