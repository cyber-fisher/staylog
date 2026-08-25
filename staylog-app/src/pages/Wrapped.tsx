import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import dayjs from "dayjs";
import { useStaylog } from "../store/staylog";
import { distanceKm, aggregateCities, nightsOf, staysInYear, summarizeYear } from "../lib/stats";
import { GROUP_META, type LoyaltyGroup } from "../types";
import { IconX } from "../components/Icons";

export default function Wrapped() {
  const { year: yearParam } = useParams();
  const year = Number(yearParam) || dayjs().year();
  const stays = useStaylog((s) => s.stays);

  const inYear = useMemo(() => staysInYear(stays, year), [stays, year]);
  const summary = useMemo(() => summarizeYear(stays, year), [stays, year]);

  const topBrand = useMemo(() => {
    const byGroup: Record<string, number> = {};
    for (const s of inYear) byGroup[s.group] = (byGroup[s.group] || 0) + nightsOf(s);
    const top = Object.entries(byGroup).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    const s = inYear.find((x) => x.group === top[0]);
    return {
      name: top[0] === "other" ? s?.customGroupName || "其他" : GROUP_META[top[0] as LoyaltyGroup]?.name || "其他",
      nights: top[1],
    };
  }, [inYear]);

  const highest = useMemo(
    () => [...inYear].filter((s) => s.rate && s.currency === "CNY").sort((a, b) => (b.rate || 0) - (a.rate || 0))[0] || null,
    [inYear]
  );

  const farthest = useMemo(() => {
    const cities = aggregateCities(inYear).filter((c) => c.lat != null);
    if (cities.length < 2) return null;
    const home = cities[0];
    let best: { city: string; km: number } | null = null;
    for (const c of cities.slice(1)) {
      const km = distanceKm(home.lat!, home.lng!, c.lat!, c.lng!);
      if (!best || km > best.km) best = { city: c.city, km };
    }
    return best;
  }, [inYear]);

  const bestRated = useMemo(
    () => [...inYear].filter((s) => s.rating != null).sort((a, b) => (b.rating || 0) - (a.rating || 0))[0] || null,
    [inYear]
  );

  if (inYear.length === 0) {
    return (
      <div className="wrapped">
        <Link to="/stats" className="btn wrapped-exit" style={{ textDecoration: "none" }}>
          <IconX width={13} height={13} /> 退出
        </Link>
        <div className="wrapped-card">
          <div className="eyebrow">STAYLOG WRAPPED</div>
          <div className="headline serif">{year} 年还没有住宿记录</div>
          <Link to="/stays" className="btn btn-primary" style={{ textDecoration: "none" }}>去记录第一晚</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="wrapped">
      <Link to="/stats" className="btn wrapped-exit" style={{ textDecoration: "none" }}>
        <IconX width={13} height={13} /> 退出
      </Link>

      <div className="wrapped-card">
        <div className="eyebrow">STAYLOG WRAPPED · {year}</div>
        <div className="headline serif">这一年，你在别处醒来的日子</div>
        <div className="sub">向下滚动，回看 {year} 年的每一晚</div>
      </div>

      <div className="wrapped-card">
        <div className="eyebrow">住宿晚数</div>
        <div className="big mono serif">{summary.nights}</div>
        <div className="headline serif">晚，不在家的夜</div>
        <div className="sub">
          {summary.nights >= 60 ? "超过两个月在路上——这是常旅客的一年。"
            : summary.nights >= 30 ? "整整一个月的异乡夜晚。"
            : "每一晚都是一段新的记忆。"}
        </div>
      </div>

      <div className="wrapped-card">
        <div className="eyebrow">足迹版图</div>
        <div className="big mono serif">{summary.cities}</div>
        <div className="headline serif">座城市 · {summary.countries} 个国家/地区</div>
        {summary.newCities.length > 0 && (
          <div className="pill-row">
            {summary.newCities.slice(0, 8).map((c) => <span key={c} className="pill">✦ 首访 {c}</span>)}
          </div>
        )}
      </div>

      {topBrand && (
        <div className="wrapped-card">
          <div className="eyebrow">最常入住</div>
          <div className="headline serif">{topBrand.name}</div>
          <div className="big mono serif">{topBrand.nights}</div>
          <div className="sub">晚 · 忠诚度拉满的一年</div>
        </div>
      )}

      {highest && (
        <div className="wrapped-card">
          <div className="eyebrow">最奢侈的一晚</div>
          <div className="headline serif">{highest.hotelName}</div>
          <div className="big mono serif">¥{(highest.rate || 0).toLocaleString()}</div>
          <div className="sub">{highest.city} · {dayjs(highest.checkIn).format("M月D日")}{highest.roomType ? ` · ${highest.roomType}` : ""}</div>
        </div>
      )}

      {farthest && (
        <div className="wrapped-card">
          <div className="eyebrow">最远的一晚</div>
          <div className="headline serif">{farthest.city}</div>
          <div className="big mono serif">{farthest.km.toLocaleString()}</div>
          <div className="sub">公里之外的枕头</div>
        </div>
      )}

      {bestRated && (
        <div className="wrapped-card">
          <div className="eyebrow">你的年度最爱</div>
          <div className="headline serif">{bestRated.hotelName}</div>
          <div className="big mono serif">★ {bestRated.rating}</div>
          {bestRated.notes && <div className="sub">"{bestRated.notes}"</div>}
        </div>
      )}

      <div className="wrapped-card">
        <div className="eyebrow">积分收成</div>
        <div className="big mono serif">{summary.pointsEarned.toLocaleString()}</div>
        <div className="headline serif">分入账</div>
        <div className="sub">下一次免费住宿正在路上。{year + 1} 年，继续在路上见。</div>
        <Link to="/stats" className="btn btn-primary" style={{ textDecoration: "none", marginTop: 10 }}>
          回到统计
        </Link>
      </div>
    </div>
  );
}
