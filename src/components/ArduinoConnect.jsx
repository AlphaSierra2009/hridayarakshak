import { useState } from "react";
import { pushECGValue } from "../hooks/useECGStream";
const decoder = new TextDecoder();

export default function ArduinoConnect() {
  const [data, setData] = useState("No data yet");
  let port = null;
  let reader = null;

  const connect = async () => {
    if (port && port.readable) {
      console.log("Port already open");
      return;
    }
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });

      reader = port.readable.getReader();

      while (port.readable) {
        const { value, done } = await reader.read();
        if (done) {
          console.log("Reader closed");
          reader.releaseLock();
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        lines.forEach((line) => {
          const clean = line.trim();
          if (clean !== "" && !isNaN(parseInt(clean))) {
            setData(clean);
            pushECGValue(parseInt(clean));
          }
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-4">
      <button
        onClick={connect}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        Connect Arduino
      </button>

      <div className="mt-4 text-xl">Data: {data}</div>
    </div>
  );
}