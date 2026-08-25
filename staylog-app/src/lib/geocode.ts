import { AMAP_KEY, gcj02ToWgs84 } from "./amap";

export interface GeoResult {
  lat: number;
  lng: number;
  displayName: string;
}

/**
 * 高德地理编码：城市/地址 → 坐标。替代原 Nominatim（国内被墙，导致境内城市无法解析坐标、
 * 地图上不显示足迹）。高德返回 GCJ-02，转成 WGS-84 存库，与全库坐标口径一致。
 * 无 key 或（多为境外）查不到时返回 null——记录照存，仅地图不落点。调用方需自行防抖。
 */
export async function geocodeCity(query: string): Promise<GeoResult | null> {
  if (!query.trim() || !AMAP_KEY) return null;
  const url =
    "https://restapi.amap.com/v3/geocode/geo?" +
    new URLSearchParams({ address: query, key: AMAP_KEY, output: "JSON" }).toString();
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "1" || !Array.isArray(data.geocodes) || data.geocodes.length === 0) {
      return null;
    }
    const g = data.geocodes[0];
    if (typeof g.location !== "string" || !g.location.includes(",")) return null;
    const [gLng, gLat] = g.location.split(",").map(Number);
    const [lng, lat] = gcj02ToWgs84(gLng, gLat);
    return { lat, lng, displayName: g.formatted_address || query };
  } catch {
    return null;
  }
}
