import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import type { LoyaltyGroup, Stay } from "../types";
import { GROUP_BRANDS, GROUP_META } from "../types";
import { geocodeCity } from "../lib/geocode";
import { matchBrand } from "../lib/brandMatch";
import { isUpcoming } from "../lib/stats";
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
  // 键盘导航高亮项（-1 = 未选中）
  const [poiActive, setPoiActive] = useState(-1);
  const [brandHint, setBrandHint] = useState<string>("");
  const poiTimer = useRef<number | undefined>(undefined);
  const poiAbort = useRef<AbortController | null>(null);
  // 选中候选后短暂抑制再次搜索，避免回填酒店名又触发一轮
  const suppressSearch = useRef(false);
  // 已由高德 POI 精确定位（锁定坐标，防 lookupCoords 用城市中心覆盖）
  const poiLocated = useRef(false);
  // geocode 请求序号，只接受最新一次结果（防后发先至）
  const geoSeq = useRef(0);

  useEffect(() => {
    if (open) {
      setForm(initial || blank());
      setGeoStatus(initial?.lat != null ? "ok" : "idle");
      setPois([]);
      setPoiOpen(false);
      setPoiActive(-1);
      setPoiStatus("idle");
      setBrandHint("");
      // 编辑已有记录且带坐标时视为已定位；新记录重置
      poiLocated.current = initial?.lat != null;
    }
  }, [open, initial]);

  // Esc：候选列表展开时先收列表，否则关闭整个表单
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (poiOpen) {
        setPoiOpen(false);
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, poiOpen, onClose]);

  // 高亮项变化时滚入可视区（候选列表有最大高度+滚动）
  useEffect(() => {
    if (poiActive < 0) return;
    document.getElementById(`poi-opt-${poiActive}`)?.scrollIntoView({ block: "nearest" });
  }, [poiActive]);

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
        setPoiActive(-1);
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

  // 候选列表键盘导航：↓/↑ 移动高亮，Enter 选中，Esc 由全局监听收列表
  function onHotelKeyDown(e: React.KeyboardEvent) {
    if (!poiOpen || pois.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPoiActive((i) => (i + 1) % pois.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPoiActive((i) => (i <= 0 ? pois.length - 1 : i - 1));
    } else if (e.key === "Enter" && poiActive >= 0 && pois[poiActive]) {
      e.preventDefault();
      pickPoi(pois[poiActive]);
    }
  }

  // 选中一条高德候选：回填名称、城市、国家、坐标，并跑品牌识别
  function pickPoi(p: AmapPoi) {
    suppressSearch.current = true;
    // 取消在途/待触发的搜索，否则残留 debounce 会重新弹出候选列表
    window.clearTimeout(poiTimer.current);
    poiAbort.current?.abort();
    // POI 坐标是精确点位，标记为已锁定，避免随后改城市名时被 lookupCoords 覆盖
    poiLocated.current = true;
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
    setPoiActive(-1);
    setPois([]);
  }

  function lookupCoords(city: string, country: string) {
    window.clearTimeout(geoTimer.current);
    if (!city.trim()) { setGeoStatus("idle"); return; }
    // 已由高德 POI 精确定位则不再用城市中心点覆盖
    if (poiLocated.current) return;
    setGeoStatus("loading");
    const seq = ++geoSeq.current;
    geoTimer.current = window.setTimeout(async () => {
      const result = await geocodeCity(`${city} ${country}`.trim());
      // 只接受最新一次请求的结果，避免"城市+国家连改时后发先至"写入旧坐标
      if (seq !== geoSeq.current) return;
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
              role="combobox" aria-expanded={poiOpen && pois.length > 0} aria-controls="poi-listbox"
              aria-activedescendant={poiActive >= 0 ? `poi-opt-${poiActive}` : undefined}
              onChange={(e) => onHotelNameChange(e.target.value)}
              onKeyDown={onHotelKeyDown}
              onFocus={() => pois.length && setPoiOpen(true)}
              placeholder="例如：上海全季酒店 / 东京康莱德" />
            {poiStatus === "loading" && <div className="geo-status">搜索酒店中…</div>}
            {poiStatus === "error" && <div className="geo-status fail">{poiError}</div>}
            {brandHint && <div className="geo-status ok">{brandHint}</div>}
            {poiOpen && pois.length > 0 && (
              <ul className="poi-list" role="listbox" id="poi-listbox" aria-label="酒店候选">
                {pois.map((p, i) => (
                  <li key={i} id={`poi-opt-${i}`} role="option" aria-selected={i === poiActive}>
                    <button type="button" className={`poi-item${i === poiActive ? " active" : ""}`}
                      onMouseEnter={() => setPoiActive(i)}
                      onClick={() => pickPoi(p)}>
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
                onChange={(e) => { poiLocated.current = false; set("city", e.target.value); lookupCoords(e.target.value, form.country); }}
                placeholder="东京" />
            </div>
            <div className="field">
              <label htmlFor="country">国家/地区</label>
              <input id="country" required value={form.country}
                onChange={(e) => { poiLocated.current = false; set("country", e.target.value); lookupCoords(form.city, e.target.value); }}
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
          {/* 未来日期 = 已订未住。提前说明不进统计，免得用户以为首页数字没刷新 */}
          {isUpcoming(form) && (
            <div className="geo-status">未来日期，将记为「即将入住」，暂不计入统计</div>
          )}
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
            <label id="rating-label">评分（选填，点击星星，再点一次取消）</label>
            <div className="rating-picker" role="radiogroup" aria-labelledby="rating-label">
              {[1, 2, 3, 4, 5].map((n) => {
                const cur = form.rating ?? 0;
                const filled = cur >= n;
                const half = !filled && cur >= n - 0.5; // 历史数据可能有 4.5 这类半星，展示为半星态
                return (
                  <button key={n} type="button" role="radio"
                    aria-checked={form.rating === n}
                    aria-label={`${n} 星`}
                    className={`star${filled ? " on" : ""}${half ? " half" : ""}`}
                    onClick={() => set("rating", form.rating === n ? undefined : n)}>
                    {filled ? "★" : half ? "★" : "☆"}
                  </button>
                );
              })}
              {form.rating != null && (
                <span className="rating-val mono">{form.rating}</span>
              )}
              {form.rating != null && (
                <button type="button" className="rating-clear" onClick={() => set("rating", undefined)}>
                  清除
                </button>
              )}
            </div>
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
