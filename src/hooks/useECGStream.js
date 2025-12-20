import { useState, useEffect } from "react";

let subscribers = [];

export function pushECGValue(val) {
  subscribers.forEach((cb) => cb(val));
}

export default function useECGStream() {
  const [reading, setReading] = useState(null);
  const [connected, setConnected] = useState(false);
  const [port, setPort] = useState(null);

  useEffect(() => {
    const cb = (v) => setReading(v);
    subscribers.push(cb);
    return () => {
      subscribers = subscribers.filter((x) => x !== cb);
    };
  }, []);

  async function connect() {
    try {
      const p = await navigator.serial.requestPort();
      await p.open({ baudRate: 9600 });
      setPort(p);
      setConnected(true);

      const decoder = new TextDecoderStream();
      p.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();

      let buffer = ""; // 🔥 holds partial chunks between reads

      console.log("ECG connected…");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += value; // append chunk text

        let lines = buffer.split("\n");

        buffer = lines.pop(); // save incomplete line for next chunk

        for (let line of lines) {
          const num = parseInt(line.trim());
          if (!isNaN(num)) {
            pushECGValue(num); // deliver perfect raw ECG values
          }
        }
      }
    } catch (err) {
      console.error("ECG read error:", err);
      setConnected(false);
    }
  }

  return {
    reading,
    connected,
    connect,
  };
}