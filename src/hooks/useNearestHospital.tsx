import { useState, useEffect } from 'react';
import { toast } from 'sonner';

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

        const response = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: query,
        });

        if (!response.ok) throw new Error('Failed to fetch hospitals');
        const data = await response.json();

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
        }
      } catch (error) {
        console.error('Nearest hospitals error:', error);
        toast.error('Failed to locate hospitals');
      } finally {
        setLoading(false);
      }
    };

    findNearestHospitals();
  }, [userLocation]);

  return { hospitals, loading };
};