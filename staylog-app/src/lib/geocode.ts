export interface GeoResult {
  lat: number;
  lng: number;
  displayName: string;
}

/** Nominatim 免费地理编码；限速约 1 req/s，调用方需防抖 */
export async function geocodeCity(query: string): Promise<GeoResult | null> {
  if (!query.trim()) return null;
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=zh&q=" +
    encodeURIComponent(query);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!arr.length) return null;
    return {
      lat: parseFloat(arr[0].lat),
      lng: parseFloat(arr[0].lon),
      displayName: arr[0].display_name,
    };
  } catch {
    return null;
  }
}
