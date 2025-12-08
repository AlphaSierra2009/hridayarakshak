import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Ambulance, Building2, Navigation } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons in Leaflet with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Custom icons
const userIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const hospitalIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Hospital {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  distance_km: number;
}

interface HospitalMapProps {
  hospitals: Hospital[];
  userLocation: { latitude: number; longitude: number } | null;
  isLoading: boolean;
}

// Component to recenter map when user location changes
const MapRecenter = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 13);
  }, [lat, lng, map]);
  return null;
};

const HospitalMap = ({ hospitals, userLocation, isLoading }: HospitalMapProps) => {
  const defaultCenter: [number, number] = [40.7128, -74.006]; // NYC default
  const center: [number, number] = userLocation
    ? [userLocation.latitude, userLocation.longitude]
    : defaultCenter;

  const openDirections = (hospital: Hospital) => {
    if (!userLocation) return;
    const url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${userLocation.latitude},${userLocation.longitude};${hospital.latitude},${hospital.longitude}`;
    window.open(url, "_blank");
  };

  return (
    <Card className="bg-card border-border glass soft-shadow hover-lift transition-all">
      <CardHeader className="pb-2 fade-in">
        <CardTitle className="flex items-center gap-2 text-foreground gradient-text">
          <Building2 className="h-5 w-5 text-primary" />
          Nearby Hospitals
          {userLocation && (
            <Badge variant="outline" className="ml-auto text-xs">
              <MapPin className="h-3 w-3 mr-1" />
              Location Active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* OpenStreetMap */}
        <div className="relative h-64 rounded-lg mb-4 overflow-hidden soft-shadow fade-in">
          {isLoading ? (
            <div className="absolute inset-0 bg-muted flex items-center justify-center glass soft-shadow">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                Loading map...
              </div>
            </div>
          ) : !userLocation ? (
            <div className="absolute inset-0 bg-muted flex items-center justify-center glass soft-shadow">
              <p className="text-muted-foreground">Enable location to see nearby hospitals</p>
            </div>
          ) : (
            <MapContainer
              center={center}
              zoom={13}
              style={{ height: "100%", width: "100%" }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
              />
              <MapRecenter lat={center[0]} lng={center[1]} />
              
              {/* User location marker */}
              <Marker position={[userLocation.latitude, userLocation.longitude]} icon={userIcon}>
                <Popup>
                  <div className="text-sm font-medium">Your Location</div>
                </Popup>
              </Marker>

              {/* Hospital markers */}
              {hospitals.map((hospital) => (
                <Marker
                  key={hospital.id}
                  position={[hospital.latitude, hospital.longitude]}
                  icon={hospitalIcon}
                >
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold">{hospital.name}</p>
                      <p className="text-xs text-gray-600">{hospital.address}</p>
                      <p className="text-xs mt-1">{hospital.distance_km} km away</p>
                      {hospital.phone && (
                        <a href={`tel:${hospital.phone}`} className="text-xs text-blue-600 hover:underline">
                          {hospital.phone}
                        </a>
                      )}
                      {userLocation && (
                        <button
                          onClick={() => openDirections(hospital)}
                          className="flex items-center gap-1 text-xs text-primary mt-1 hover:underline"
                        >
                          <Navigation className="h-3 w-3" />
                          Directions
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>

        {/* Hospital list */}
        <div className="space-y-2 max-h-64 overflow-y-auto fade-in">
          {hospitals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hospitals found nearby
            </p>
          ) : (
            hospitals.map((hospital) => (
              <div
                key={hospital.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-all hover-lift soft-shadow"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm text-foreground truncate">
                      {hospital.name}
                    </h4>
                    <Badge variant="secondary" className="text-xs">
                      {hospital.distance_km} km
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{hospital.address}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {hospital.phone && (
                      <a
                        href={`tel:${hospital.phone}`}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {hospital.phone}
                      </a>
                    )}
                    {userLocation && (
                      <button
                        onClick={() => openDirections(hospital)}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Navigation className="h-3 w-3" />
                        Directions
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default HospitalMap;
