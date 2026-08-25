import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import type { LoyaltyGroup, Stay } from "../types";
import { GROUP_BRANDS, GROUP_META } from "../types";
import { geocodeCity } from "../lib/geocode";
import { matchBrand } from "../lib/brandMatch";
import { searchPoi, AmapError, amapErrorText, AMAP_KEY, type AmapPoi } from "../lib/amap";
import { IconX, IconSearch } from "./Icons";

interface Props {
  open: boolean;
  initial?: Stay | null;
  onSave: (stay: Stay) => void;
  onClose: () => void;
}

function blank(): Stay {
  return {
    id: crypto.randomUUID(),
    hotelName: "",
    brand: "",
    group: "hilton",
    city: "",
    country: "",
    checkIn: dayjs().format("YYYY-MM-DD"),
    checkOut: dayjs().add(1, "day").format("YYYY-MM-DD"),
    currency: "CNY",
  };
}

export default function StayForm({ open, initial, onSave, onClose }: Props) {
  const [form, setForm] = useState<Stay>(() => initial || blank());
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const geoTimer = useRef<number | undefined>(undefined);

  // 高德 POI 候选
  const [pois, setPois] = useState<AmapPoi[]>([]);
  const [poiOpen, setPoiOpen] = useState(false);
  const [poiStatus, setPoiStatus] = useState<"idle" | "loading" | "error">("idle");
  const [poiError, setPoiError] = useState("");
  const [brandHint, setBrandHint] = useState<string>("");
  const poiTimer = useRef<number | undefined>(undefined);
  const poiAbort = useRef<AbortController | null>(null);
  // 选中候选后短暂抑制再次搜索，避免回填酒店名又触发一轮
  const suppressSearch = useRef(false);

  useEffect(() => {
    if (open) {
      setForm(initial || blank());
      setGeoStatus(initial?.lat != null ? "ok" : "idle");
      setPois([]);
      setPoiOpen(false);
      setPoiStatus("idle");
      setBrandHint("");
    }
  }, [open, initial]);

  function set<K extends keyof Stay>(key: K, value: Stay[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // 离线品牌识别：从酒店名推断集团+子品牌，自动填充
  function applyBrandMatch(name: string) {
    const m = matchBrand(name);
    if (m) {
      setForm((f) => ({ ...f, group: m.group, brand: m.brand }));
      setBrandHint(`已识别：${GROUP_META[m.group].name} · ${m.brand}`);
    } else {
      setBrandHint("");
    }
  }

  // 高德在线搜索（防抖）
  function searchHotels(name: string) {
    window.clearTimeout(poiTimer.current);
    if (!AMAP_KEY || name.trim().length < 2) {
      setPois([]);
      setPoiOpen(false);
      return;
    }
    setPoiStatus("loading");
    poiTimer.current = window.setTimeout(async () => {
      poiAbort.current?.abort();
      const ctrl = new AbortController();
      poiAbort.current = ctrl;
      try {
        const results = await searchPoi(name, AMAP_KEY, ctrl.signal);
        setPois(results);
        setPoiOpen(results.length > 0);
        setPoiStatus("idle");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setPoiStatus("error");
        setPoiError(e instanceof AmapError ? amapErrorText(e.code) : "搜索失败，请稍后重试");
        setPois([]);
        setPoiOpen(false);
      }
    }, 500);
  }

  function onHotelNameChange(name: string) {
    set("hotelName", name);
    applyBrandMatch(name);
    if (suppressSearch.current) { suppressSearch.current = false; return; }
    searchHotels(name);
  }

  // 选中一条高德候选：回填名称、城市、国家、坐标，并跑品牌识别
  function pickPoi(p: AmapPoi) {
    suppressSearch.current = true;
    setForm((f) => ({
      ...f,
      hotelName: p.name,
      city: p.city.replace(/市$/, "") || f.city,
      country: "中国",
      lat: p.lat,
      lng: p.lng,
    }));
    applyBrandMatch(p.name);
    setGeoStatus("ok");
    setPoiOpen(false);
    setPois([]);
  }

  function lookupCoords(city: string, country: string) {
    window.clearTimeout(geoTimer.current);
    if (!city.trim()) { setGeoStatus("idle"); return; }
    // 已由高德定位则不再覆盖
    setGeoStatus("loading");
    geoTimer.current = window.setTimeout(async () => {
      const result = await geocodeCity(`${city} ${country}`.trim());
      if (result) {
        setForm((f) => ({ ...f, lat: result.lat, lng: result.lng }));
        setGeoStatus("ok");
      } else {
        setGeoStatus("fail");
      }
    }, 600);
  }

  if (!open) return null;

  const brandOptions = GROUP_BRANDS[form.group];

  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <form
        className="drawer"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
      >
        <div className="drawer-head">
          <h2>{initial ? "编辑住宿记录" : "新增住宿记录"}</h2>
          <button type="button" onClick={onClose} aria-label="关闭"><IconX /></button>
        </div>
        <div className="drawer-body">
          <div className="field" style={{ position: "relative" }}>
            <label htmlFor="hotelName">
              酒店名称
              {AMAP_KEY && <span style={{ color: "var(--faint)", fontWeight: 400, marginLeft: 8 }}>输入即搜索</span>}
            </label>
            <input id="hotelName" required autoComplete="off" value={form.hotelName}
              onChange={(e) => onHotelNameChange(e.target.value)}
              onFocus={() => pois.length && setPoiOpen(true)}
              placeholder="例如：上海全季酒店 / 东京康莱德" />
            {poiStatus === "loading" && <div className="geo-status">搜索酒店中…</div>}
            {poiStatus === "error" && <div className="geo-status fail">{poiError}</div>}
            {brandHint && <div className="geo-status ok">{brandHint}</div>}
            {poiOpen && pois.length > 0 && (
              <ul className="poi-list" role="listbox">
                {pois.map((p, i) => (
                  <li key={i}>
                    <button type="button" className="poi-item" onClick={() => pickPoi(p)}>
                      <span className="poi-icon"><IconSearch width={13} height={13} /></span>
                      <span className="poi-text">
                        <b>{p.name}</b>
                        <span className="poi-addr">{p.city}{p.district ? " · " + p.district : ""}{p.address ? " · " + p.address : ""}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="field">
            <label htmlFor="hotelNameEn">酒店英文名（选填）</label>
            <input id="hotelNameEn" value={form.hotelNameEn || ""}
              onChange={(e) => set("hotelNameEn", e.target.value)} placeholder="Conrad Tokyo" />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="group">所属集团</label>
              <select id="group" value={form.group}
                onChange={(e) => set("group", e.target.value as LoyaltyGroup)}>
                {Object.entries(GROUP_META).map(([key, m]) => (
                  <option key={key} value={key}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="brand">子品牌</label>
              <input id="brand" list="brand-options" required value={form.brand}
                onChange={(e) => set("brand", e.target.value)} placeholder="例如：康莱德" />
              <datalist id="brand-options">
                {brandOptions.map((b) => <option key={b} value={b} />)}
              </datalist>
            </div>
          </div>
          {form.group === "other" && (
            <div className="field">
              <label htmlFor="customGroupName">集团名称</label>
              <input id="customGroupName" value={form.customGroupName || ""}
                onChange={(e) => set("customGroupName", e.target.value)} placeholder="例如：亚朵星球" />
            </div>
          )}
          <div className="field-row">
            <div className="field">
              <label htmlFor="city">城市</label>
              <input id="city" required value={form.city}
                onChange={(e) => { set("city", e.target.value); lookupCoords(e.target.value, form.country); }}
                placeholder="东京" />
            </div>
            <div className="field">
              <label htmlFor="country">国家/地区</label>
              <input id="country" required value={form.country}
                onChange={(e) => { set("country", e.target.value); lookupCoords(form.city, e.target.value); }}
                placeholder="日本" />
            </div>
          </div>
          {geoStatus === "loading" && <div className="geo-status">定位中…</div>}
          {geoStatus === "ok" && form.lat != null && (
            <div className="geo-status ok">已定位 · {form.lat.toFixed(2)}, {form.lng!.toFixed(2)}</div>
          )}
          {geoStatus === "fail" && (
            <div className="geo-status fail">自动定位失败，地图页将不显示此城市（不影响记录保存）</div>
          )}
          <div className="field-row">
            <div className="field">
              <label htmlFor="checkIn">入住日期</label>
              <input id="checkIn" type="date" required value={form.checkIn}
                onChange={(e) => set("checkIn", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="checkOut">离店日期</label>
              <input id="checkOut" type="date" required value={form.checkOut}
                min={form.checkIn} onChange={(e) => set("checkOut", e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="roomType">房型（选填）</label>
            <input id="roomType" value={form.roomType || ""}
              onChange={(e) => set("roomType", e.target.value)} placeholder="行政大床房" />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="rate">房价/晚（选填）</label>
              <input id="rate" type="number" min={0} value={form.rate ?? ""}
                onChange={(e) => set("rate", e.target.value ? Number(e.target.value) : undefined)} />
            </div>
            <div className="field">
              <label htmlFor="currency">币种</label>
              <select id="currency" value={form.currency || "CNY"}
                onChange={(e) => set("currency", e.target.value)}>
                <option value="CNY">CNY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="JPY">JPY</option>
                <option value="HKD">HKD</option>
                <option value="THB">THB</option>
                <option value="GBP">GBP</option>
                <option value="AED">AED</option>
                <option value="SGD">SGD</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="pointsEarned">获得积分（选填）</label>
              <input id="pointsEarned" type="number" min={0} value={form.pointsEarned ?? ""}
                onChange={(e) => set("pointsEarned", e.target.value ? Number(e.target.value) : undefined)} />
            </div>
            <div className="field">
              <label htmlFor="pointsRedeemed">兑换积分（选填）</label>
              <input id="pointsRedeemed" type="number" min={0} value={form.pointsRedeemed ?? ""}
                onChange={(e) => set("pointsRedeemed", e.target.value ? Number(e.target.value) : undefined)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="rating">评分（选填，1-5）</label>
            <input id="rating" type="number" min={1} max={5} step={0.5} value={form.rating ?? ""}
              onChange={(e) => set("rating", e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="field">
            <label htmlFor="tags">标签（选填，逗号分隔）</label>
            <input id="tags" value={form.tags?.join(", ") || ""}
              onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
              placeholder="度假, 出差" />
          </div>
          <div className="field">
            <label htmlFor="notes">备注（选填）</label>
            <textarea id="notes" rows={3} value={form.notes || ""}
              onChange={(e) => set("notes", e.target.value)} placeholder="套房升级、房间景观等" />
          </div>
        </div>
        <div className="drawer-foot">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="submit" className="btn btn-primary">保存记录</button>
        </div>
      </form>
    </>
  );
}
