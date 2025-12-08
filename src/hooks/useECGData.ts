import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ECGReading {
  id: string;
  reading_value: number;
  heart_rate?: number;
  st_elevation_detected: boolean;
  reading_timestamp: string;
  latitude?: number;
  longitude?: number;
}

export const useECGData = (userId?: string) => {
  const [readings, setReadings] = useState<ECGReading[]>([]);
  const [latestReading, setLatestReading] = useState<ECGReading | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!userId) return;

    // Fetch initial readings
    const fetchReadings = async () => {
      const { data, error } = await supabase
        .from("ecg_readings")
        .select("*")
        .eq("user_id", userId)
        .order("reading_timestamp", { ascending: false })
        .limit(200);

      if (!error && data) {
        setReadings(data.reverse());
        if (data.length > 0) {
          setLatestReading(data[data.length - 1]);
        }
      }
    };

    fetchReadings();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("ecg-readings-channel")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ecg_readings",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newReading = payload.new as ECGReading;
          setReadings((prev) => [...prev.slice(-199), newReading]);
          setLatestReading(newReading);
          setIsConnected(true);

          // Reset connection status after 5 seconds of no data
          setTimeout(() => {
            setIsConnected(false);
          }, 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return {
    readings,
    latestReading,
    isConnected,
    heartRate: latestReading?.heart_rate,
    stElevationDetected: latestReading?.st_elevation_detected || false,
  };
};
