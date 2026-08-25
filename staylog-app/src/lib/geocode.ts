import { AMAP_KEY, gcj02ToWgs84 } from "./amap";

export interface GeoResult {
  lat: number;
  lng: number;
  displayName: string;
}

// 可信的行政级别（高德对城市/区县返回这些 level）。
// 境外城市漏进来时高德多半返回 level=村庄/兴趣点 且 count>1，据此拒绝。
const TRUSTED_LEVELS = ["国家", "省", "直辖市", "自治区", "城市", "市", "区县", "区", "县", "开发区", "乡镇", "街道"];

/** 判断高德返回的 country 是否为中国相关（含港澳台；空值也放行——高德内地常留空） */
function isChinaCountry(country: unknown): boolean {
  if (country == null || country === "") return true;
  const c = String(country);
  return c.includes("中国") || c.includes("中华人民共和国");
}

/**
 * 高德地理编码：城市/地址 → 坐标。替代原 Nominatim（国内被墙，导致境内城市无法解析坐标、
 * 地图上不显示足迹）。高德返回 GCJ-02，转成 WGS-84 存库，与全库坐标口径一致。
 *
 * ⚠️ 高德 geocode 只对中国有效：境外城市要么返回空，要么返回错误的国内点
 * （实测"东京"→广西村庄、"迪拜"→四川兴趣点）。故对结果做境内守卫，境外/模糊一律返回 null，
 * 避免把境外酒店错误定位到国内。境外坐标应由高德 POI 手选提供。
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

    // 境内守卫 ①：country 明确是其他国家 → 拒绝
    if (!isChinaCountry(g.country)) return null;
    // 境内守卫 ②：多义 + 非行政级别（村庄/兴趣点）视为境外漏配的模糊匹配 → 拒绝
    const count = Number(data.count) || 0;
    const level = String(g.level ?? "");
    if (count > 1 && !TRUSTED_LEVELS.includes(level)) return null;

    const [gLng, gLat] = g.location.split(",").map(Number);
    const [lng, lat] = gcj02ToWgs84(gLng, gLat);
    return { lat, lng, displayName: g.formatted_address || query };
  } catch {
    return null;
  }
}
