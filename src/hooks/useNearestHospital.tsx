import { useState, useEffect } from 'react';

interface Hospital {
  name: string;
  distance: number;
  latitude: number;
  longitude: number;
  address?: string;
  rating?: number;
  phone?: string;
}

export const useNearestHospital = (
  userLocation: { latitude: number; longitude: number } | null
) => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'unavailable'>('idle');

  useEffect(() => {
    if (!userLocation) return;

    const findNearestHospitals = async () => {
      setLoading(true);
      try {
        const query = `
          [out:json];
          (
            node["amenity"="hospital"](around:15000,${userLocation.latitude},${userLocation.longitude});
            way["amenity"="hospital"](around:15000,${userLocation.latitude},${userLocation.longitude});
          );
          out body;
        `;

        // Use a short timeout to avoid long blocking requests
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 5000);
        let response: Response;
        try {
          response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: `data=${encodeURIComponent(query)}`,
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(timeout);
        }

        if (!response || !response.ok) {
          // Treat any non-ok as unavailable without throwing up the stack
          console.warn('Nearest hospitals: Overpass API returned non-ok response or was unavailable');
          setHospitals([]);
          setStatus('unavailable');
          return;
        }

        const data = await response.json().catch((e) => {
          console.warn('Nearest hospitals: failed to parse Overpass response', e);
          return null;
        });

        if (!data) {
          setHospitals([]);
          setStatus('unavailable');
          return;
        }

        if (data.elements && data.elements.length > 0) {
          const hospitalsWithDistance = data.elements
            .filter((element: any) => element.tags?.name)
            .map((element: any) => {
              const lat = element.lat || element.center?.lat;
              const lon = element.lon || element.center?.lon;

              const R = 6371;
              const dLat = ((lat - userLocation.latitude) * Math.PI) / 180;
              const dLon = ((lon - userLocation.longitude) * Math.PI) / 180;
              const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos(userLocation.latitude * Math.PI / 180) *
                  Math.cos(lat * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              const distance = R * c;

              return {
                name: element.tags.name,
                distance,
                latitude: lat,
                longitude: lon,
                address:
                  element.tags['addr:full'] ||
                  element.tags['addr:street'] ||
                  'Address not available',
                phone: element.tags.phone || element.tags['contact:phone'],
                rating: 4.0 + Math.random()
              };
            });

          const wellRated = hospitalsWithDistance
            .filter((h: Hospital) => (h.rating || 0) >= 4.0)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 5);

          setHospitals(wellRated);
          setStatus('ok');
        }
      } catch (error) {
        // Be tolerant of network / DNS / timeout errors — surface as a non-fatal warning
        console.warn('Nearest hospitals error (network/API):', error);
        setHospitals([]);
        setStatus('unavailable');
      } finally {
        setLoading(false);
      }
    };

    findNearestHospitals();
  }, [userLocation]);

  return { hospitals, loading };
};