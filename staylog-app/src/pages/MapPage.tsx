import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useStaylog } from "../store/staylog";
import { aggregateCities, aggregateHotels, distanceKm, type HotelAgg } from "../lib/stats";
import { wgs84ToGcj02 } from "../lib/amap";
import { geocodeCity } from "../lib/geocode";
import { GROUP_META, type LoyaltyGroup } from "../types";
import EmptyState from "../components/EmptyState";

// 单一高德栅格底图（style=7 街道图，GCJ-02，中文地名，国内极快）。
// 标记坐标统一 WGS-84 存库，显示时 wgs84ToGcj02 投到高德底图（境外为恒等变换）。
const AMAP_TILES = [1, 2, 3, 4].map(
  (n) => `https://webst0${n}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}`
);

// 集团配色（与 src/styles/tokens.css 的 --hilton 等保持同步）。
const GROUP_HEX: Record<LoyaltyGroup, string> = {
  hilton: "#3f76d4",
  huazhu: "#d97544",
  other: "#c9a24b", // 香槟金 --gold
};
const BRASS = "#c9a24b";

function buildStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      amap: { type: "raster", tiles: AMAP_TILES, tileSize: 256, maxzoom: 18, attribution: "© 高德地图" },
    },
    layers: [{ id: "amap", type: "raster", source: "amap" }],
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// 高德 geocode 只对中国有效——只补全境内酒店（含港澳台）。country 含"中国"或为空即视为境内。
function isDomestic(country: string | undefined): boolean {
  if (!country) return true;
  return country.includes("中国") || country.includes("中华人民共和国");
}

// 水滴图钉的 SVG（尖端在底部中心 14,36，配 anchor:"bottom" 精准落点）。
function pinSvg(color: string): string {
  return (
    `<svg class="map-pin-svg" width="30" height="38" viewBox="0 0 28 36" aria-hidden="true">` +
    `<path d="M14 0C6.27 0 0 6.27 0 14c0 9.6 14 22 14 22s14-12.4 14-22C28 6.27 21.73 0 14 0z" fill="${color}" stroke="#fff" stroke-width="1.6"/>` +
    `<circle cx="14" cy="14" r="5.4" fill="#fff"/>` +
    `</svg>`
  );
}

export default function MapPage() {
  const stays = useStaylog((s) => s.stays);
  const updateStay = useStaylog((s) => s.updateStay);
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;

  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const hotels = useMemo(() => aggregateHotels(stays).filter((h) => h.lat != null), [stays]);
  const hotelsRef = useRef(hotels);
  hotelsRef.current = hotels;
  const cities = useMemo(() => aggregateCities(stays), [stays]);
  const located = cities.filter((c) => c.lat != null);

  const [activeCity, setActiveCity] = useState<string | null>(null);
  // 存量数据自动补全定位的进度提示（{done,total}），完成后清空
  const [geocoding, setGeocoding] = useState<{ done: number; total: number } | null>(null);
  const backfillRan = useRef(false);
  // 是否已把视野框到酒店点（避免数据多次到达时反复抢镜）
  const didFit = useRef(false);

  const homeBase = located[0];
  const farthest = useMemo(() => {
    if (!homeBase || located.length < 2) return null;
    let best = null as null | { city: string; km: number };
    for (const c of located.slice(1)) {
      const km = distanceKm(homeBase.lat!, homeBase.lng!, c.lat!, c.lng!);
      if (!best || km > best.km) best = { city: c.city, km };
    }
    return best;
  }, [located, homeBase]);

  // WGS-84 → 高德显示坐标（境外恒等，境内对齐高德底图）
  function project(lng: number, lat: number): [number, number] {
    return wgs84ToGcj02(lng, lat);
  }

  // 点图钉 → 弹卡片（复用现有 popup 样式 + 容器事件委托跳转）
  function openHotelPopup(map: maplibregl.Map, h: HotelAgg) {
    const meta = GROUP_META[h.group as LoyaltyGroup] || GROUP_META.other;
    const rating = h.avgRating != null ? ` · ★ ${h.avgRating}` : "";
    const html =
      `<div class="map-popup">` +
      `<div class="mp-title serif">${escapeHtml(h.hotelName)}</div>` +
      `<div class="mp-meta"><span class="chip ${meta.className}">${escapeHtml(meta.short)}</span>` +
      `<span class="sub">${escapeHtml(h.city)} · 住过 ${h.visits} 次 · 共 ${h.nights} 晚${rating}</span></div>` +
      `<button class="map-popup-cta" data-hotel="${escapeHtml(h.hotelName)}">查看入住记录 →</button>` +
      `</div>`;
    new maplibregl.Popup({ offset: 34, closeButton: true })
      .setLngLat(project(h.lng!, h.lat!))
      .setHTML(html)
      .addTo(map);
  }

  // 用 HTML 自定义图钉重建全部标记（DOM 标记不依赖 style 就绪，天然规避加载时序竞态）。
  function syncMarkers() {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    for (const h of hotelsRef.current) {
      const color = GROUP_HEX[h.group as LoyaltyGroup] ?? BRASS;
      const el = document.createElement("div");
      el.className = "map-pin";
      el.title = h.hotelName;
      el.innerHTML = pinSvg(color) + (h.visits > 1 ? `<span class="map-pin-badge">${h.visits}</span>` : "");
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openHotelPopup(map, h);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(project(h.lng!, h.lat!))
        .addTo(map);
      markersRef.current.push(marker);
    }
  }

  useEffect(() => {
    if (!containerRef.current || stays.length === 0) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      center: [105, 35],
      zoom: 3.6,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    // DOM 标记可在建图后立即添加，无需等 'load'
    syncMarkers();
    if (hotelsRef.current.length > 0) {
      didFit.current = true;
      fitToHotels(0);
    }

    // popup 里的"查看入住记录"按钮在 React 树外，用容器事件委托桥接到路由
    const container = map.getContainer();
    const onDelegatedClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest("[data-hotel]") as HTMLElement | null;
      if (btn) navRef.current(`/stays?q=${encodeURIComponent(btn.dataset.hotel!)}`);
    };
    container.addEventListener("click", onDelegatedClick);

    return () => {
      container.removeEventListener("click", onDelegatedClick);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stays.length === 0]);

  // 酒店数据变化（含存量补全逐个落坐标）→ 重建图钉；首次拿到点时框景。
  useEffect(() => {
    if (!mapRef.current) return;
    syncMarkers();
    if (!didFit.current && hotels.length > 0) {
      didFit.current = true;
      fitToHotels(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotels]);

  // 存量数据自动补全：旧记录（Nominatim 时代手填城市）缺坐标 → 逐个高德补全并写回云端。
  // 只处理"有城市名、境内、缺坐标"的记录；每会话跑一次，串行 + 间隔防限频。
  useEffect(() => {
    if (backfillRan.current) return;
    const pending = stays.filter((s) => s.lat == null && s.city?.trim() && isDomestic(s.country));
    if (pending.length === 0) return;
    backfillRan.current = true;

    let cancelled = false;
    (async () => {
      setGeocoding({ done: 0, total: pending.length });
      for (let i = 0; i < pending.length; i++) {
        if (cancelled) return;
        const s = pending[i];
        const r = await geocodeCity(`${s.city} ${s.country || ""}`.trim());
        if (cancelled) return;
        if (r) updateStay(s.id, { lat: r.lat, lng: r.lng });
        setGeocoding({ done: i + 1, total: pending.length });
        if (i < pending.length - 1) await new Promise((res) => setTimeout(res, 300));
      }
      if (!cancelled) setGeocoding(null);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stays]);

  function flyToCity(city: string, lat: number, lng: number) {
    setActiveCity(city);
    mapRef.current?.flyTo({ center: project(lng, lat), zoom: 10, duration: 1600 });
  }

  // 把视野框到全部已定位酒店（含海外）；无点则回落到全国视图。duration=0 用于初始化。
  function fitToHotels(duration: number) {
    const map = mapRef.current;
    if (!map) return;
    const h = hotelsRef.current;
    if (h.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      h.forEach((x) => bounds.extend(project(x.lng!, x.lat!)));
      map.fitBounds(bounds, { padding: 80, maxZoom: 10, duration });
    } else if (h.length === 1) {
      map.jumpTo({ center: project(h[0].lng!, h[0].lat!), zoom: 11 });
    } else {
      map.flyTo({ center: [105, 35], zoom: 3.6, duration });
    }
  }

  function resetView() {
    setActiveCity(null);
    fitToHotels(800);
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
            <button key={c.city} className={"city-row" + (activeCity === c.city ? " active" : "")}
              disabled={c.lat == null}
              aria-current={activeCity === c.city ? "true" : undefined}
              onClick={() => c.lat != null && flyToCity(c.city, c.lat, c.lng!)}
              title={c.lat == null ? "此城市未定位（编辑住宿记录补全城市名可自动定位）" : `定位到${c.city}`}>
              <span>{c.city}</span>
              <span className="n mono">{c.nights} 晚</span>
            </button>
          ))}
        </aside>
        <div className="map-main">
          <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
          <button className="map-reset-btn" onClick={resetView} title="重置到全国视图">
            重置视图
          </button>
          {geocoding && (
            <div className="map-geocoding" role="status">
              正在定位 <b className="mono">{geocoding.done}/{geocoding.total}</b> 家酒店…
            </div>
          )}
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
