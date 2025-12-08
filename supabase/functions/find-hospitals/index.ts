import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req: Request) => {
  try {
    const { latitude, longitude, radius_km = 10 } = await req.json();

    if (!latitude || !longitude) {
      return new Response(
        JSON.stringify({ error: "Missing latitude/longitude" }),
        { status: 400 }
      );
    }

    const overpassUrl = "https://overpass.kumi.systems/api/interpreter";

    // Multi-radius fallback sequence (km)
    const searchRadii = [radius_km, 15, 20, 30];

    let hospitals: any[] = [];

    for (const r of searchRadii) {
      const query = `
        [out:json];
        (
          node["amenity"="hospital"](around:${r * 1000}, ${latitude}, ${longitude});
          way["amenity"="hospital"](around:${r * 1000}, ${latitude}, ${longitude});
          relation["amenity"="hospital"](around:${r * 1000}, ${latitude}, ${longitude});

          node["healthcare"="hospital"](around:${r * 1000}, ${latitude}, ${longitude});
          way["healthcare"="hospital"](around:${r * 1000}, ${latitude}, ${longitude});
          relation["healthcare"="hospital"](around:${r * 1000}, ${latitude}, ${longitude});

          node["amenity"="clinic"](around:${r * 1000}, ${latitude}, ${longitude});
          way["amenity"="clinic"](around:${r * 1000}, ${latitude}, ${longitude});
          relation["amenity"="clinic"](around:${r * 1000}, ${latitude}, ${longitude});

          node["healthcare"="clinic"](around:${r * 1000}, ${latitude}, ${longitude});
          way["healthcare"="clinic"](around:${r * 1000}, ${latitude}, ${longitude});
          relation["healthcare"="clinic"](around:${r * 1000}, ${latitude}, ${longitude});

          node["healthcare"="doctor"](around:${r * 1000}, ${latitude}, ${longitude});
          way["healthcare"="doctor"](around:${r * 1000}, ${latitude}, ${longitude});
          relation["healthcare"="doctor"](around:${r * 1000}, ${latitude}, ${longitude});
        );
        out center;
      `;

      const res = await fetch(overpassUrl, {
        method: "POST",
        body: query,
      });

      const json = await res.json();

      hospitals = (json.elements || []).map((el: any) => {
        const lat = el.lat || el.center?.lat;
        const lon = el.lon || el.center?.lon;

        return {
          id: el.id,
          name: el.tags?.name || "Unknown Facility",
          type:
            el.tags?.amenity ||
            el.tags?.healthcare ||
            "medical_facility",
          latitude: lat,
          longitude: lon,
          address:
            el.tags?.["addr:full"] ||
            el.tags?.["addr:street"] ||
            "",
          phone: el.tags?.phone || "",
          distance_km: getDistance(latitude, longitude, lat, lon),
        };
      });

      if (hospitals.length > 0) break;
    }

    hospitals.sort((a, b) => a.distance_km - b.distance_km);

    return new Response(
      JSON.stringify({
        status: "ok",
        found: hospitals.length,
        hospitals,
      }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as any).message }), {
      status: 500,
    });
  }
});

// Haversine distance formula
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}