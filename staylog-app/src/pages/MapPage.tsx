import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { useStaylog } from "../store/staylog";
import { aggregateCities, aggregateHotels, distanceKm } from "../lib/stats";
import { wgs84ToGcj02, inChina } from "../lib/amap";
import { GROUP_META, type LoyaltyGroup } from "../types";
import EmptyState from "../components/EmptyState";

// 双栅格底图，按缩放/位置切换：
// - darkgray：ESRI Dark Gray（天然深色，任何缩放不空白，无需反相），用于世界/大区/海外
// - amap：高德街道图（GCJ-02，中文地名，国内极快），用于国内城市放大
// 坐标自洽：amap 下标记 WGS→GCJ 对齐；darkgray 下 GCJ 转换是恒等变换（=WGS），对齐 ESRI。
const AMAP_TILES = [1, 2, 3, 4].map(
  (n) => `https://webst0${n}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}`
);
const ESRI_DARK = ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"];
const ESRI_DARK_REF = ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"];

// 集团配色（硬编码 hex，与 src/styles/tokens.css 的 --hilton 等保持同步；
// MapLibre paint 表达式读不了 CSS 变量，故此处独立维护一份暗色系 hex）。
const GROUP_HEX: Record<LoyaltyGroup, string> = {
  hilton: "#3f76d4",
  marriott: "#b0453f",
  ihg: "#8a5fc0",
  hyatt: "#4d9e8a",
  huazhu: "#d97544",
  other: "#d4a853", // 黄铜 --brass
};
const BRASS = "#d4a853";

type BaseMode = "amap" | "darkgray";

function buildStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      amap: { type: "raster", tiles: AMAP_TILES, tileSize: 256, maxzoom: 18, attribution: "© 高德地图" },
      esriDark: { type: "raster", tiles: ESRI_DARK, tileSize: 256, maxzoom: 16, attribution: "© Esri" },
      esriDarkRef: { type: "raster", tiles: ESRI_DARK_REF, tileSize: 256, maxzoom: 16 },
    },
    layers: [
      { id: "amap", type: "raster", source: "amap", layout: { visibility: "none" } },
      { id: "esri-dark", type: "raster", source: "esriDark", layout: { visibility: "visible" } },
      { id: "esri-dark-ref", type: "raster", source: "esriDarkRef", layout: { visibility: "visible" } },
    ],
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export default function MapPage() {
  const stays = useStaylog((s) => s.stays);
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;

  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<BaseMode>("darkgray");

  const hotels = useMemo(() => aggregateHotels(stays).filter((h) => h.lat != null), [stays]);
  const hotelsRef = useRef(hotels);
  hotelsRef.current = hotels;
  const cities = useMemo(() => aggregateCities(stays), [stays]);
  const located = cities.filter((c) => c.lat != null);

  const [activeCity, setActiveCity] = useState<string | null>(null);

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

  // 按当前底图把 WGS-84 坐标转成显示坐标（amap→GCJ-02；darkgray 不变）
  function project(lng: number, lat: number): [number, number] {
    return modeRef.current === "amap" ? wgs84ToGcj02(lng, lat) : [lng, lat];
  }

  // 用当前底图基准构建酒店 GeoJSON（供聚合 source）
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

  // 依据视区中心与缩放决定底图：国内城市级用高德街道，否则深灰
  function desiredMode(): BaseMode {
    const map = mapRef.current!;
    const c = map.getCenter();
    return inChina(c.lng, c.lat) && map.getZoom() >= 6 ? "amap" : "darkgray";
  }

  function applyMode(next: BaseMode) {
    const map = mapRef.current;
    if (!map || modeRef.current === next) return;
    modeRef.current = next;
    map.setLayoutProperty("amap", "visibility", next === "amap" ? "visible" : "none");
    map.setLayoutProperty("esri-dark", "visibility", next === "amap" ? "none" : "visible");
    map.setLayoutProperty("esri-dark-ref", "visibility", next === "amap" ? "none" : "visible");
    // 底图基准变了，用新基准重建标记（境外 GCJ=WGS 无跳动，境内重新对齐）
    (map.getSource("hotels") as maplibregl.GeoJSONSource | undefined)?.setData(buildHotelFC());
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
      "marriott", GROUP_HEX.marriott,
      "ihg", GROUP_HEX.ihg,
      "hyatt", GROUP_HEX.hyatt,
      "huazhu", GROUP_HEX.huazhu,
      BRASS, // 默认（other 及未知）
    ];
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
    modeRef.current = "darkgray"; // 初始世界视图 = 深灰

    map.on("load", () => {
      addMarkerLayers();
      const h = hotelsRef.current;
      if (h.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        h.forEach((x) => bounds.extend(project(x.lng!, x.lat!)));
        map.fitBounds(bounds, { padding: 80, maxZoom: 6, duration: 0 });
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

    map.on("moveend", () => applyMode(desiredMode()));

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

  // 酒店数据变化 → 用当前基准重建 source
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("hotels") as maplibregl.GeoJSONSource | undefined;
    src?.setData(buildHotelFC());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotels]);

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
      map.fitBounds(bounds, { padding: 80, maxZoom: 6, duration: 800 });
    } else {
      map.flyTo({ center: [105, 30], zoom: 1.8, duration: 800 });
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
          <button className="map-reset-btn" onClick={resetView} title="重置到全球视图">
            重置视图
          </button>
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
