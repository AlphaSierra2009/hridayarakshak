import { useState, useEffect } from "react";

let subscribers = [];

export function pushECGValue(val) {
  subscribers.forEach((cb) => cb(val));
}

export default function useECGStream() {
  const [reading, setReading] = useState(null);

  useEffect(() => {
    const callback = (val) => setReading(val);

    subscribers.push(callback);

    return () => {
      subscribers = subscribers.filter((cb) => cb !== callback);
    };
  }, []);

  return reading;
}