// src/components/NearestHospital.tsx
import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Clock } from "lucide-react";
import { toast } from "sonner";

interface NearestHospitalProps {
  location?: { latitude: number; longitude: number } | null;
}

type Hospital = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters?: number;
  address?: string;
};

const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const overpassQuery = (lat: number, lon: number, radius = 5000) => {
  return `[out:json][timeout:25];
(
  node["amenity"="hospital"](around:${radius},${lat},${lon});
  node["amenity"="clinic"](around:${radius},${lat},${lon});
  way["amenity"="hospital"](around:${radius},${lat},${lon});
  way["amenity"="clinic"](around:${radius},${lat},${lon});
);
out center;`;
};

export default function NearestHospital({ location }: NearestHospitalProps) {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [radius, setRadius] = useState<number>(3000);

  useEffect(() => {
    if (!location) return;
    fetchNearby(location.latitude, location.longitude, radius);
  }, [location, radius]);

  async function fetchNearby(lat: number, lon: number, searchRadius = 3000) {
    setLoading(true);
    setHospitals([]);
    try {
      const q = overpassQuery(lat, lon, searchRadius);
      const url = `https://overpass-api.de/api/interpreter`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: `data=${encodeURIComponent(q)}`,
      });

      if (!res.ok) throw new Error("Overpass failed");
      const json = await res.json();
      const elements = json.elements || [];

      const found: Hospital[] = elements
        .map((el: any) => {
          const latE = el.lat ?? el.center?.lat;
          const lonE = el.lon ?? el.center?.lon;

          return {
            id: String(el.id),
            name:
              (el.tags && (el.tags.name || el.tags.operator)) ||
              "Hospital/Clinic",
            lat: latE,
            lon: lonE,
            address: el.tags?.addr_full || el.tags?.address || undefined,
          } as Hospital;
        })
        .filter((h: Hospital) => h.lat && h.lon);

      const withDist = found.map((h) => ({
        ...h,
        distanceMeters: haversineMeters(lat, lon, h.lat, h.lon),
      }));
      withDist.sort(
        (a, b) => (a.distanceMeters || 1e9) - (b.distanceMeters || 1e9)
      );

      setHospitals(withDist);
    } catch (err) {
      console.error("NearestHospital error", err);
      toast.error("Failed to find nearby hospitals (Overpass timeout)");

      setHospitals([
        {
          id: "fallback",
          name: "Hospital data temporarily unavailable",
          lat: lat,
          lon: lon,
          distanceMeters: undefined,
          address: "Network issue or API timeout"
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  const openNavigation = (destLat: number, destLon: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLon}&travelmode=driving`;
    window.open(url, "_blank");
  };

  const formatMeters = (m?: number) => {
    if (!m && m !== 0) return "--";
    if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
    return `${Math.round(m)} m`;
  };

  return (
    <Card className="p-4 overflow-hidden border-2 bg-card/60">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Nearby Hospitals</h3>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (!location) {
              toast.error("Location required");
              return;
            }
            fetchNearby(location.latitude, location.longitude, radius);
          }}
        >
          Refresh
        </Button>
      </div>

      {!location ? (
        <div className="text-sm text-muted-foreground p-3 rounded bg-zinc-900/60">
          📍 Location access not available yet. Please allow location to find nearby hospitals.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
            <Clock className="h-4 w-4" /> Search radius:
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="ml-1 bg-transparent border rounded px-2 py-1 text-sm"
            >
              <option value={1000}>1 km</option>
              <option value={3000}>3 km</option>
              <option value={5000}>5 km</option>
              <option value={10000}>10 km</option>
            </select>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">
              Searching nearby hospitals…
            </div>
          ) : hospitals.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No hospitals found within {formatMeters(radius)}.
            </div>
          ) : (
            <div className="space-y-2">
              {hospitals.slice(0, 6).map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between p-2 bg-zinc-900 rounded"
                >
                  <div>
                    <div className="font-medium text-sm">{h.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.address || (h.distanceMeters ? formatMeters(h.distanceMeters) : "—")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Distance: {formatMeters(h.distanceMeters)}
                    </div>
                  </div>

                  {h.id !== "fallback" && (
                    <Button
                      size="sm"
                      onClick={() => openNavigation(h.lat, h.lon)}
                      className="whitespace-nowrap"
                    >
                      <Navigation className="h-3 w-3 mr-2 inline-block" />
                      Navigate
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}