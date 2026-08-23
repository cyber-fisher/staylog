import { useEffect, useMemo, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useStaylog } from "../store/staylog";
import { aggregateCities, aggregateHotels, distanceKm } from "../lib/stats";
import EmptyState from "../components/EmptyState";

// OpenFreeMap：真正的 OpenStreetMap 数据，免 API key，国内网络可达
// （OSM 官方瓦片 tile.openstreetmap.org 与 CARTO 栅格底图在此网络被墙）
const DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";
const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/positron";

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
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const hotels = useMemo(() => aggregateHotels(stays).filter((h) => h.lat != null), [stays]);
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

  useEffect(() => {
    if (!containerRef.current || stays.length === 0) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: currentThemeIsDark() ? DARK_STYLE : LIGHT_STYLE,
      center: [105, 30],
      zoom: 1.8,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stays.length === 0]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const h of hotels) {
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
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([h.lng!, h.lat!])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
    }

    if (hotels.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      hotels.forEach((h) => bounds.extend([h.lng!, h.lat!]));
      map.fitBounds(bounds, { padding: 80, maxZoom: 6, duration: 0 });
    }
  }, [hotels]);

  // 跟随亮/暗主题切换底图（HTML 标记是 overlay，setStyle 不影响，无需重建）
  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const map = mapRef.current;
      if (map) map.setStyle(currentThemeIsDark() ? DARK_STYLE : LIGHT_STYLE);
    };
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    mql.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      mql.removeEventListener("change", sync);
    };
  }, []);

  function flyToCity(lat: number, lng: number) {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 10, duration: 1600 });
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
        <div className="map-main">
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
