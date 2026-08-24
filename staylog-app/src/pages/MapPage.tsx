import { useEffect, useMemo, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useStaylog } from "../store/staylog";
import { aggregateCities, aggregateHotels, distanceKm } from "../lib/stats";
import { wgs84ToGcj02, inChina } from "../lib/amap";
import EmptyState from "../components/EmptyState";

// 纯栅格双源，避开矢量瓦片"字体+样式+几十块瓦片全下完才渲染"的全有或全无失败：
// - 国内：高德街道图（GCJ-02，中文地名，~0.15s，国内极快）
// - 境外放大：ESRI 卫星影像（WGS-84，全球覆盖，高德海外高缩放为空白）
// 坐标自洽：境内标记 WGS→GCJ 对齐高德；境外 GCJ 转换是恒等变换，等于 WGS，对齐 ESRI。
const AMAP_TILES = [1, 2, 3, 4].map(
  (n) => `https://webst0${n}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}`
);
const ESRI_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];

type BaseMode = "amap" | "esri";

function buildStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      amap: { type: "raster", tiles: AMAP_TILES, tileSize: 256, maxzoom: 18, attribution: "© 高德地图" },
      esri: { type: "raster", tiles: ESRI_TILES, tileSize: 256, maxzoom: 19, attribution: "© Esri, Maxar" },
    },
    layers: [
      { id: "amap", type: "raster", source: "amap", layout: { visibility: "visible" } },
      { id: "esri", type: "raster", source: "esri", layout: { visibility: "none" } },
    ],
  };
}

function currentThemeIsDark(): boolean {
  const stamped = document.documentElement.getAttribute("data-theme");
  if (stamped === "dark") return true;
  if (stamped === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function MapPage() {
  const stays = useStaylog((s) => s.stays);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const modeRef = useRef<BaseMode>("amap");

  const hotels = useMemo(() => aggregateHotels(stays).filter((h) => h.lat != null), [stays]);
  const hotelsRef = useRef(hotels);
  hotelsRef.current = hotels;
  const cities = useMemo(() => aggregateCities(stays), [stays]);
  const located = cities.filter((c) => c.lat != null);

  const homeBase = located[0]; // 以晚数最多的城市为"家"的近似参照
  const farthest = useMemo(() => {
    if (!homeBase || located.length < 2) return null;
    let best = null as null | { city: string; km: number };
    for (const c of located.slice(1)) {
      const km = distanceKm(homeBase.lat!, homeBase.lng!, c.lat!, c.lng!);
      if (!best || km > best.km) best = { city: c.city, km };
    }
    return best;
  }, [located, homeBase]);

  // 按当前底图把 WGS-84 坐标转成显示坐标（高德底图下转 GCJ-02，卫星底图下不变）
  function project(lng: number, lat: number): [number, number] {
    return modeRef.current === "amap" ? wgs84ToGcj02(lng, lat) : [lng, lat];
  }

  // 暗色主题 + 高德街道图时给底图画布加反相滤镜，凑成深色底图（不影响 HTML 标记/弹窗）
  function syncTint() {
    const el = mainRef.current;
    if (!el) return;
    el.classList.toggle("tint-dark", modeRef.current === "amap" && currentThemeIsDark());
  }

  function placeMarkers() {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    for (const h of hotelsRef.current) {
      const size = Math.max(10, Math.min(26, 8 + h.nights * 1.6));
      const el = document.createElement("div");
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:var(--brass);box-shadow:0 0 0 4px var(--map-glow),0 0 14px var(--map-glow);cursor:pointer;`;
      el.setAttribute("aria-label", `${h.hotelName}，${h.nights}晚`);
      const popup = new maplibregl.Popup({ offset: 14 }).setHTML(
        `<div class="map-popup"><b>${h.hotelName}</b><br>` +
        `<span class="sub">${h.city} · 住过 ${h.visits} 次 · 共 ${h.nights} 晚` +
        (h.avgRating != null ? ` · ★ ${h.avgRating}` : "") +
        `</span></div>`
      );
      const [dLng, dLat] = project(h.lng!, h.lat!);
      const marker = new maplibregl.Marker({ element: el }).setLngLat([dLng, dLat]).setPopup(popup).addTo(map);
      markersRef.current.push(marker);
    }
  }

  // 依据视区中心与缩放决定底图：境外且放大到城市级用卫星，否则用高德
  function desiredMode(): BaseMode {
    const map = mapRef.current!;
    const c = map.getCenter();
    return !inChina(c.lng, c.lat) && map.getZoom() >= 7 ? "esri" : "amap";
  }

  function applyMode(next: BaseMode) {
    const map = mapRef.current;
    if (!map || modeRef.current === next) return;
    modeRef.current = next;
    map.setLayoutProperty("amap", "visibility", next === "amap" ? "visible" : "none");
    map.setLayoutProperty("esri", "visibility", next === "esri" ? "visible" : "none");
    placeMarkers(); // 境内 GCJ / 境外 WGS，切换后重放标记（境外两者相等，无跳动）
    syncTint();
  }

  useEffect(() => {
    if (!containerRef.current || stays.length === 0) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      center: [105, 30],
      zoom: 1.8,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    modeRef.current = "amap";

    map.on("load", () => {
      placeMarkers();
      syncTint();
      const h = hotelsRef.current;
      if (h.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        h.forEach((x) => bounds.extend(project(x.lng!, x.lat!)));
        map.fitBounds(bounds, { padding: 80, maxZoom: 6, duration: 0 });
      } else if (h.length === 1) {
        map.jumpTo({ center: project(h[0].lng!, h[0].lat!), zoom: 11 });
      }
    });
    map.on("moveend", () => applyMode(desiredMode()));

    return () => {
      markersRef.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stays.length === 0]);

  // 酒店列表变化时重放标记
  useEffect(() => {
    if (!mapRef.current) return;
    placeMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotels]);

  // 跟随亮/暗主题：仅需更新反相滤镜（栅格底图本身不分主题）
  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const observer = new MutationObserver(syncTint);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    mql.addEventListener("change", syncTint);
    return () => {
      observer.disconnect();
      mql.removeEventListener("change", syncTint);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flyToCity(lat: number, lng: number) {
    mapRef.current?.flyTo({ center: project(lng, lat), zoom: 10, duration: 1600 });
  }

  if (stays.length === 0) {
    return (
      <main className="page">
        <div className="page-head"><h1 className="serif">足迹地图</h1></div>
        <EmptyState />
      </main>
    );
  }

  return (
    <div className="page-full">
      <div className="map-layout">
        <aside className="map-side">
          <h2 className="serif">城市足迹</h2>
          {cities.map((c) => (
            <button key={c.city} className="city-row"
              disabled={c.lat == null}
              onClick={() => c.lat != null && flyToCity(c.lat, c.lng!)}
              title={c.lat == null ? "此城市未定位（编辑住宿记录补全城市名可自动定位）" : `定位到${c.city}`}>
              <span>{c.city}</span>
              <span className="n mono">{c.nights} 晚</span>
            </button>
          ))}
        </aside>
        <div className="map-main" ref={mainRef}>
          <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
          <div className="map-statbar">
            <span>累计足迹 <b className="mono">{cities.length}</b> 城 · <b className="mono">{new Set(stays.map((s) => s.country)).size}</b> 国</span>
            {homeBase && <span>最常入住 <b>{homeBase.city}</b>（{homeBase.nights}晚）</span>}
            {farthest && <span>最远足迹 <b>{farthest.city}</b> · <b className="mono">{farthest.km.toLocaleString()}</b> km</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
