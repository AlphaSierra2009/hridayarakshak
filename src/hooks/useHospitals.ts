import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Hospital {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  distance_km: number;
}

export const useHospitals = (latitude?: number, longitude?: number) => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!latitude || !longitude) return;

    const fetchHospitals = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: funcError } = await supabase.functions.invoke("find-hospitals", {
          body: {
            latitude,
            longitude,
            limit: 10,
            max_distance_km: 50,
          },
        });

        if (funcError) throw funcError;

        const hospitalsList = data?.hospitals;

        const dummyHospitals: Hospital[] = [
          {
            id: "1",
            name: "Apollo Hospital",
            address: "Test Address 1",
            phone: "+91 9876543210",
            latitude,
            longitude,
            distance_km: 1.2,
          },
          {
            id: "2",
            name: "Yashoda Hospital",
            address: "Test Address 2",
            phone: "+91 9123456780",
            latitude: latitude + 0.01,
            longitude: longitude + 0.01,
            distance_km: 3.5,
          },
        ];

        if (!hospitalsList || hospitalsList.length === 0) {
          console.warn("Using dummy hospitals fallback.");
          setHospitals(dummyHospitals);
          return;
        }

        if (hospitalsList && Array.isArray(hospitalsList)) {
          setHospitals(hospitalsList);
        } else {
          console.warn("No hospitals returned from API. Response was:", data);
        }
      } catch (err) {
        console.error("Error fetching hospitals:", err);
        setError("Failed to fetch nearby hospitals");
      } finally {
        setIsLoading(false);
      }
    };

    fetchHospitals();
  }, [latitude, longitude]);

  return { hospitals, isLoading, error };
};
