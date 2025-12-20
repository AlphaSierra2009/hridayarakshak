import emailjs from "@emailjs/browser";

export async function callTriggerEmergency(payload: {
  notes?: string;
  stemi_level?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  is_test?: boolean;
}) {
  const templateParams = {
    alert_type: payload.is_test ? "TEST ALERT" : "EMERGENCY ALERT",
    message: payload.notes || "Possible STEMI detected",
    stemi_level: payload.stemi_level ?? "N/A",
    latitude: payload.latitude ?? "Unknown",
    longitude: payload.longitude ?? "Unknown",
    map_link:
      payload.latitude && payload.longitude
        ? `https://www.google.com/maps?q=${payload.latitude},${payload.longitude}`
        : "Location unavailable",
  };

  const result = await emailjs.send(
    import.meta.env.VITE_EMAILJS_SERVICE_ID,
    import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
    templateParams,
    import.meta.env.VITE_EMAILJS_PUBLIC_KEY
  );

  return result;
}