import NearestHospital from "@/components/NearestHospital";
import HospitalMap from "@/components/HospitalMap";
import { useLocation } from "@/hooks/useLocation";
import { useNearestHospital } from "@/hooks/useNearestHospital";

const Hospitals = () => {
  const { location, isLoading } = useLocation();
  const { hospitals, loading } = useNearestHospital(location);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Nearby Hospitals</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NearestHospital location={location} />
        <HospitalMap
          hospitals={hospitals.map((h, idx) => ({
            id: h.id ?? `${idx}`,
            name: h.name,
            address: h.address || "",
            phone: (h as any).phone || "",
            latitude: h.lat,
            longitude: h.lon,
            distance_km: Number(((h.distanceMeters || 0) / 1000).toFixed(2)),
          }))}
          userLocation={location}
          isLoading={isLoading || loading}
        />
      </div>
    </div>
  );
};

export default Hospitals;
