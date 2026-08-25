import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { useStaylog } from "../store/staylog";
import { aggregateCities, aggregateHotels, distanceKm } from "../lib/stats";
import { wgs84ToGcj02 } from "../lib/amap";
import { geocodeCity } from "../lib/geocode";
import { GROUP_META, type LoyaltyGroup } from "../types";
import EmptyState from "../components/EmptyState";

// 单一高德栅格底图（style=7 街道图，GCJ-02，中文地名，国内极快）。
// 之前的 ESRI 深灰 + 双底图切换全部移除——ESRI/demotiles 字体都是海外托管，
// 国内连不通导致底图空白、聚合数字不显示，是"足迹不显示"的根因之一。
// 标记坐标统一 WGS-84 存库，显示时 wgs84ToGcj02 投到高德底图（境外为恒等变换）。
const AMAP_TILES = [1, 2, 3, 4].map(
  (n) => `https://webst0${n}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}`
);

// 集团配色（硬编码 hex，与 src/styles/tokens.css 的 --hilton 等保持同步；
// MapLibre paint 表达式读不了 CSS 变量，故此处独立维护一份）。
const GROUP_HEX: Record<LoyaltyGroup, string> = {
  hilton: "#3f76d4",
  huazhu: "#d97544",
  other: "#d4a853", // 黄铜 --brass
};
const BRASS = "#d4a853";

function buildStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    // 自托管字形（聚合数字文字层需要）：public/font/ 下相对路径，国内可达、离线可用
    glyphs: "/font/{fontstack}/{range}.pbf",
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

export default function MapPage() {
  const stays = useStaylog((s) => s.stays);
  const updateStay = useStaylog((s) => s.updateStay);
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;

  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hotels = useMemo(() => aggregateHotels(stays).filter((h) => h.lat != null), [stays]);
  const hotelsRef = useRef(hotels);
  hotelsRef.current = hotels;
  const cities = useMemo(() => aggregateCities(stays), [stays]);
  const located = cities.filter((c) => c.lat != null);

  const [activeCity, setActiveCity] = useState<string | null>(null);
  // 存量数据自动补全定位的进度提示（{done,total}），完成后清空
  const [geocoding, setGeocoding] = useState<{ done: number; total: number } | null>(null);
  const backfillRan = useRef(false);

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

  // 酒店 GeoJSON（供聚合 source）
  function buildHotelFC(): FeatureCollection {
    return {
      type: "FeatureCollection",
      features: hotelsRef.current.map((h) => {
        const [lng, lat] = project(h.lng!, h.lat!);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: {
            hotelName: h.hotelName,
            group: h.group,
            city: h.city,
            nights: h.nights,
            visits: h.visits,
            avgRating: h.avgRating,
          },
        } as Feature;
      }),
    };
  }

  function addMarkerLayers() {
    const map = mapRef.current!;
    map.addSource("hotels", {
      type: "geojson",
      data: buildHotelFC(),
      cluster: true,
      clusterRadius: 46,
      clusterMaxZoom: 11,
    });

    // 聚合圆（黄铜色，按数量分档）+ 光晕描边
    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "hotels",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": ["step", ["get", "point_count"], "#d4a853", 10, "#b98a3e", 25, "#9c7330"],
        "circle-radius": ["step", ["get", "point_count"], 16, 10, 21, 25, 27],
        "circle-stroke-width": 6,
        "circle-stroke-color": "rgba(212,168,83,0.35)",
      },
    });
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "hotels",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 13,
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#0d1320" },
    });
    // 单点光晕
    map.addLayer({
      id: "unclustered-glow",
      type: "circle",
      source: "hotels",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": groupColorExpr(),
        "circle-radius": ["interpolate", ["linear"], ["get", "nights"], 1, 12, 20, 19, 40, 24],
        "circle-blur": 1,
        "circle-opacity": 0.35,
      },
    });
    // 单点主体（按集团配色）
    map.addLayer({
      id: "unclustered",
      type: "circle",
      source: "hotels",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": groupColorExpr(),
        "circle-radius": ["interpolate", ["linear"], ["get", "nights"], 1, 6, 20, 13, 40, 18],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#0d1320",
      },
    });
  }

  function groupColorExpr(): maplibregl.ExpressionSpecification {
    return [
      "match", ["get", "group"],
      "hilton", GROUP_HEX.hilton,
      "huazhu", GROUP_HEX.huazhu,
      BRASS, // 默认（other 及未知/旧集团）
    ];
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

    map.on("load", () => {
      addMarkerLayers();
      const h = hotelsRef.current;
      if (h.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        h.forEach((x) => bounds.extend(project(x.lng!, x.lat!)));
        map.fitBounds(bounds, { padding: 80, maxZoom: 10, duration: 0 });
      } else if (h.length === 1) {
        map.jumpTo({ center: project(h[0].lng!, h[0].lat!), zoom: 11 });
      }

      // 点聚合 → 展开放大（v6：getClusterExpansionZoom 返回 Promise）
      map.on("click", "clusters", async (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        const clusterId = f.properties!.cluster_id;
        const src = map.getSource("hotels") as maplibregl.GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom });
      });

      // 点单个酒店 → 弹卡片
      map.on("click", "unclustered", (e) => {
        const f = e.features![0];
        const p = f.properties!;
        const coords = (f.geometry as Point).coordinates.slice() as [number, number];
        const meta = GROUP_META[p.group as LoyaltyGroup] || GROUP_META.other;
        const rating = p.avgRating != null ? ` · ★ ${p.avgRating}` : "";
        const html =
          `<div class="map-popup">` +
          `<div class="mp-title serif">${escapeHtml(p.hotelName)}</div>` +
          `<div class="mp-meta"><span class="chip ${meta.className}">${escapeHtml(meta.short)}</span>` +
          `<span class="sub">${escapeHtml(p.city)} · 住过 ${p.visits} 次 · 共 ${p.nights} 晚${rating}</span></div>` +
          `<button class="map-popup-cta" data-hotel="${escapeHtml(String(p.hotelName))}">查看入住记录 →</button>` +
          `</div>`;
        new maplibregl.Popup({ offset: 16, closeButton: true }).setLngLat(coords).setHTML(html).addTo(map);
      });

      for (const layer of ["clusters", "unclustered"]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
    });

    // popup 里的"查看入住记录"按钮在 React 树外，用容器事件委托桥接到路由
    const container = map.getContainer();
    const onDelegatedClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest("[data-hotel]") as HTMLElement | null;
      if (btn) navRef.current(`/stays?q=${encodeURIComponent(btn.dataset.hotel!)}`);
    };
    container.addEventListener("click", onDelegatedClick);

    return () => {
      container.removeEventListener("click", onDelegatedClick);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stays.length === 0]);

  // 酒店数据变化 → 重建 source
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("hotels") as maplibregl.GeoJSONSource | undefined;
    src?.setData(buildHotelFC());
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

  function resetView() {
    const map = mapRef.current;
    if (!map) return;
    const h = hotelsRef.current;
    setActiveCity(null);
    if (h.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      h.forEach((x) => bounds.extend(project(x.lng!, x.lat!)));
      map.fitBounds(bounds, { padding: 80, maxZoom: 10, duration: 800 });
    } else {
      map.flyTo({ center: [105, 35], zoom: 3.6, duration: 800 });
    }
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
