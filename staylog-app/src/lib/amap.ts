/**
 * 高德地图 POI 文本搜索。
 * 高德返回 GCJ-02（火星坐标），而地图底图用 WGS-84，必须转换，否则标记偏移数百米。
 * 高德 REST API 开启了 CORS(*)，浏览器可直连，无需后端代理。
 * 免费 key：https://lbs.amap.com 注册应用 → Web服务 类型。
 */

export interface AmapPoi {
  name: string;
  /** 已转换为 WGS-84 */
  lng: number;
  lat: number;
  city: string;
  province: string;
  district: string;
  address: string;
  type: string;
}

// ---- GCJ-02 -> WGS-84 坐标转换 ----
const PI = Math.PI;
const A = 6378245.0; // 长半轴
const EE = 0.00669342162296594323; // 偏心率平方

function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function transformLat(x: number, y: number): number {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  ret += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
  ret += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
  return ret;
}
function transformLng(x: number, y: number): number {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  ret += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
  ret += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
  return ret;
}

/** GCJ-02 → WGS-84（用于把高德坐标放到 OSM/卫星底图上） */
export function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return [lng * 2 - (lng + dLng), lat * 2 - (lat + dLat)];
}

/**
 * WGS-84 → GCJ-02（把真实坐标放到高德底图上，否则偏移数百米）。
 * 中国境外为恒等变换（返回原值），因此在卫星等 WGS 底图上无副作用。
 */
export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return [lng + dLng, lat + dLat];
}

/** 判断经纬度是否在中国境内（决定用高德底图还是海外卫星） */
export function inChina(lng: number, lat: number): boolean {
  return !outOfChina(lng, lat);
}

export class AmapError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AmapError";
  }
}

/** 把高德错误码转成用户能看懂的中文提示 */
export function amapErrorText(code: string): string {
  switch (code) {
    case "10001": return "高德 Key 无效，请到设置里核对";
    case "10003": return "高德今日调用次数已用完，明天再试或换 Key";
    case "10009": return "高德 Key 与安全设置不符（Web 服务 Key 请勿绑定域名白名单）";
    case "10012": return "高德 Key 权限不足，请确认申请的是「Web 服务」类型";
    default: return "高德搜索失败（错误码 " + code + "）";
  }
}

interface AmapRawPoi {
  name: string;
  location: string; // "lng,lat" GCJ-02
  pname: string;
  cityname: string;
  adname: string;
  address: string | string[];
  type: string;
}

/**
 * 搜索 POI。返回坐标已转 WGS-84。
 * 抛 AmapError（含高德错误码）供调用方展示：10001=key无效，10003=超配额，等。
 */
export async function searchPoi(keywords: string, key: string, signal?: AbortSignal): Promise<AmapPoi[]> {
  if (!keywords.trim() || !key) return [];
  const url =
    "https://restapi.amap.com/v3/place/text?" +
    new URLSearchParams({
      keywords,
      key,
      offset: "8",
      page: "1",
      extensions: "base",
      // 限定为住宿相关 POI 类型（宾馆酒店 100000 大类），减少无关结果
      types: "100000",
    }).toString();

  const res = await fetch(url, { signal });
  if (!res.ok) throw new AmapError("http_" + res.status, `高德请求失败 (HTTP ${res.status})`);
  const data = await res.json();

  if (data.status !== "1") {
    throw new AmapError(data.infocode || "unknown", data.info || "高德返回错误");
  }
  const pois: AmapRawPoi[] = Array.isArray(data.pois) ? data.pois : [];
  return pois
    .filter((p) => typeof p.location === "string" && p.location.includes(","))
    .map((p) => {
      const [gLng, gLat] = p.location.split(",").map(Number);
      const [lng, lat] = gcj02ToWgs84(gLng, gLat);
      return {
        name: p.name,
        lng,
        lat,
        city: p.cityname || p.pname || "",
        province: p.pname || "",
        district: p.adname || "",
        address: Array.isArray(p.address) ? p.address.join("") : p.address || "",
        type: p.type || "",
      };
    });
}
