import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useStaylog } from "../store/staylog";
import { aggregateCities, aggregateHotels, distanceKm, totalTravelKm, type HotelAgg } from "../lib/stats";
import { inChina, wgs84ToGcj02 } from "../lib/amap";
import { geocodeCity } from "../lib/geocode";
import { GROUP_META, type LoyaltyGroup } from "../types";
import EmptyState from "../components/EmptyState";

// 单一高德栅格底图（style=7 街道图，GCJ-02，中文地名，国内极快）。
// 标记坐标统一 WGS-84 存库，显示时 wgs84ToGcj02 投到高德底图（境外为恒等变换）。
const AMAP_TILES = [1, 2, 3, 4].map(
  (n) => `https://webrd0${n}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}`
);

// 中国核心视野（经度 108.5°E，纬度 33.5°N，完美居中东部与中西部各主要城市）
const CHINA_CENTER: [number, number] = [108.5, 33.5];
const CHINA_ZOOM = 4.5;

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
      amap: {
        type: "raster",
        tiles: AMAP_TILES,
        tileSize: 256,
        minzoom: 3,
        maxzoom: 18,
        attribution: "© 高德地图",
      },
    },
    layers: [
      {
        id: "bg",
        type: "background",
        paint: {
          "background-color": "#e8e5de", // 与高德陆地底色契合的淡暖灰底色，避免白屏
        },
      },
      { id: "amap", type: "raster", source: "amap" },
    ],
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

// 现代化发光足迹微气泡标记 HTML
function markerHtml(h: HotelAgg, color: string): string {
  const nightText = h.nights > 1 ? `${h.nights}晚` : h.visits > 1 ? `${h.visits}次` : "";
  return (
    `<div class="map-footprint-marker" style="--marker-color:${color}">` +
      `<div class="mfm-glow"></div>` +
      `<div class="mfm-core ${nightText ? "has-text" : "is-dot"}">` +
        `<span class="mfm-dot"></span>` +
        (nightText ? `<span class="mfm-label mono">${nightText}</span>` : "") +
      `</div>` +
      `<div class="mfm-hover-card">` +
        `<span class="mhc-name">${escapeHtml(h.hotelName)}</span>` +
        `<span class="mhc-meta">${escapeHtml(h.city)} · ${h.nights}晚</span>` +
      `</div>` +
    `</div>`
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
  // 侧边栏：城市搜索关键字 + 排序方式（晚数 / 名称）+ 图例展开
  const [cityQuery, setCityQuery] = useState("");
  const [citySort, setCitySort] = useState<"nights" | "name">("nights");
  const [legendOpen, setLegendOpen] = useState(false);
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

  // 侧边栏城市列表：先按关键字过滤，再按当前排序方式排序（晚数降序 / 名称升序）
  const shownCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    const filtered = q ? cities.filter((c) => c.city.toLowerCase().includes(q)) : cities;
    const sorted = [...filtered];
    if (citySort === "name") sorted.sort((a, b) => a.city.localeCompare(b.city, "zh"));
    else sorted.sort((a, b) => b.nights - a.nights);
    return sorted;
  }, [cities, cityQuery, citySort]);

  // 未定位城市数量（提示用户去补全城市名以自动定位）
  const unlocatedCount = useMemo(() => cities.filter((c) => c.lat == null).length, [cities]);
  // 累计旅行里程（以最常入住城市为基点的单程大圆距离之和）
  const travelKm = useMemo(() => totalTravelKm(cities), [cities]);

  // WGS-84 → 高德显示坐标（境外恒等，境内对齐高德底图）
  function project(lng: number, lat: number): [number, number] {
    return wgs84ToGcj02(lng, lat);
  }

  // 点标记 → 弹卡片（复用现有 popup 样式 + 容器事件委托跳转）
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
    new maplibregl.Popup({ offset: 16, closeButton: true })
      .setLngLat(project(h.lng!, h.lat!))
      .setHTML(html)
      .addTo(map);
  }

  // 用现代化发光足迹微气泡重建全部标记
  function syncMarkers() {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    for (const h of hotelsRef.current) {
      const color = GROUP_HEX[h.group as LoyaltyGroup] ?? BRASS;
      const el = document.createElement("div");
      el.innerHTML = markerHtml(h, color);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openHotelPopup(map, h);
      });
      const marker = new maplibregl.Marker({ element: el.firstElementChild as HTMLElement, anchor: "center" })
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
      center: CHINA_CENTER,
      zoom: CHINA_ZOOM,
      minZoom: 3.5,
      maxZoom: 18,
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

  // 默认自适应国内足迹范围；无国内点时聚焦中国全境中心
  function fitToHotels(duration: number) {
    const map = mapRef.current;
    if (!map) return;
    // 优先框出中国境内所有足迹点，避免被个别海外点（如迪拜、纽约）把全景强行拉到荒漠/中亚
    const domestic = hotelsRef.current.filter((h) => inChina(h.lng!, h.lat!));
    if (domestic.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      domestic.forEach((x) => bounds.extend(project(x.lng!, x.lat!)));
      map.fitBounds(bounds, { padding: 60, minZoom: 4, maxZoom: 8, duration });
    } else if (domestic.length === 1) {
      map.flyTo({ center: project(domestic[0].lng!, domestic[0].lat!), zoom: 9, duration });
    } else if (hotelsRef.current.length > 0) {
      // 纯海外用户：框出全部点
      const bounds = new maplibregl.LngLatBounds();
      hotelsRef.current.forEach((x) => bounds.extend(project(x.lng!, x.lat!)));
      map.fitBounds(bounds, { padding: 60, minZoom: 2, maxZoom: 8, duration });
    } else {
      map.flyTo({ center: CHINA_CENTER, zoom: CHINA_ZOOM, duration });
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
          <div className="map-side-head">
            <h2 className="serif">城市足迹</h2>
            <div className="map-sort">
              <button type="button" className={citySort === "nights" ? "on" : ""}
                onClick={() => setCitySort("nights")}>按晚数</button>
              <button type="button" className={citySort === "name" ? "on" : ""}
                onClick={() => setCitySort("name")}>按名称</button>
            </div>
          </div>
          <input className="map-city-search" type="search" value={cityQuery}
            onChange={(e) => setCityQuery(e.target.value)} placeholder="搜索城市…" aria-label="搜索城市" />
          {unlocatedCount > 0 && (
            <div className="map-unlocated-tip">{unlocatedCount} 座城市未定位，补全城市名可自动上图</div>
          )}
          <div className="city-list">
            {shownCities.map((c) => (
              <button key={c.city} className={"city-row" + (activeCity === c.city ? " active" : "")}
                disabled={c.lat == null}
                aria-current={activeCity === c.city ? "true" : undefined}
                onClick={() => c.lat != null && flyToCity(c.city, c.lat, c.lng!)}
                title={c.lat == null ? "此城市未定位（编辑住宿记录补全城市名可自动定位）" : `定位到${c.city}`}>
                <i className="city-dot" style={{ background: GROUP_HEX[c.topGroup as LoyaltyGroup] ?? BRASS }} />
                <span>{c.city}</span>
                <span className="c-visits">{c.stays} 次</span>
                <span className="n mono">{c.nights} 晚</span>
              </button>
            ))}
            {shownCities.length === 0 && <div className="map-city-empty">未找到匹配的城市</div>}
          </div>
        </aside>
        <div className="map-main">
          <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
          <button className="map-reset-btn" onClick={resetView} title="重置到全部酒店视图">
            重置视图
          </button>
          <div className="map-legend">
            <button type="button" className="map-legend-toggle" onClick={() => setLegendOpen((v) => !v)}>
              图例
            </button>
            {legendOpen && (
              <div className="map-legend-body">
                {(["hilton", "huazhu", "other"] as LoyaltyGroup[]).map((g) => (
                  <span key={g}><i style={{ background: GROUP_HEX[g] }} />{GROUP_META[g].short}</span>
                ))}
                <span className="map-legend-note">微气泡标签＝入住晚数</span>
              </div>
            )}
          </div>
          {geocoding && (
            <div className="map-geocoding" role="status">
              正在定位 <b className="mono">{geocoding.done}/{geocoding.total}</b> 家酒店…
            </div>
          )}
          <div className="map-statbar">
            <span>累计足迹 <b className="mono">{cities.length}</b> 城 · <b className="mono">{new Set(stays.map((s) => s.country)).size}</b> 国</span>
            {homeBase && <span>最常入住 <b>{homeBase.city}</b>（{homeBase.nights}晚）</span>}
            {farthest && <span>最远足迹 <b>{farthest.city}</b> · <b className="mono">{farthest.km.toLocaleString()}</b> km</span>}
            {travelKm > 0 && <span>累计里程 <b className="mono">{travelKm.toLocaleString()}</b> km</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
