import { useMemo } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useStaylog } from "../store/staylog";
import { aggregateCities, nightsByGroup, summarizeYear, yearsWithData } from "../lib/stats";
import EmptyState from "../components/EmptyState";
import { GROUP_META, type LoyaltyGroup } from "../types";
import { IconSparkle } from "../components/Icons";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function Stats() {
  const stays = useStaylog((s) => s.stays);
  const years = useMemo(() => yearsWithData(stays), [stays]);
  const currentYear = dayjs().year();

  const groupData = useMemo(() => {
    const byGroup = nightsByGroup(stays);
    return Object.entries(byGroup)
      .map(([g, nights]) => ({
        name: g === "other" ? "其他" : GROUP_META[g as LoyaltyGroup].name,
        nights,
        color: cssVar(GROUP_META[g as LoyaltyGroup]?.cssVar || "--other"),
      }))
      .sort((a, b) => b.nights - a.nights);
  }, [stays]);

  const yearlyTrend = useMemo(
    () =>
      [...years].sort((a, b) => a - b).map((y) => {
        const sum = summarizeYear(stays, y);
        return { year: String(y), nights: sum.nights, spend: sum.spendCny, avg: sum.avgRateCny || 0 };
      }),
    [stays, years]
  );

  const cities = useMemo(() => aggregateCities(stays).slice(0, 8), [stays]);
  const maxCityNights = Math.max(1, ...cities.map((c) => c.nights));

  const ratingDist = useMemo(() => {
    const bins = [0, 0, 0, 0, 0]; // 1..5（向下取整）
    for (const s of stays) {
      if (s.rating != null) bins[Math.min(4, Math.max(0, Math.floor(s.rating) - 1))] += 1;
    }
    return bins.map((n, i) => ({ star: `${i + 1}★`, count: n }));
  }, [stays]);

  const pointsEfficiency = useMemo(() => {
    const rated = stays.filter((s) => s.rate && s.currency === "CNY" && s.pointsEarned);
    if (!rated.length) return null;
    const pts = rated.reduce((n, s) => n + (s.pointsEarned || 0), 0);
    const spend = rated.reduce((n, s) => n + (s.rate || 0), 0);
    return Math.round((pts / spend) * 10) / 10;
  }, [stays]);

  if (stays.length === 0) {
    return (
      <main className="page">
        <div className="page-head"><h1 className="serif">统计分析</h1></div>
        <EmptyState />
      </main>
    );
  }

  const tooltipStyle = {
    background: "var(--surface-2)", border: "1px solid var(--line)",
    borderRadius: 8, fontSize: 12, color: "var(--text)",
  };

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="serif">统计分析</h1>
          <div className="sub">共 {stays.length} 条记录，跨越 {years.length} 个年份</div>
        </div>
        <Link to={`/stats/wrapped/${currentYear}`} className="btn btn-primary" style={{ textDecoration: "none" }}>
          <IconSparkle width={14} height={14} /> {currentYear} 年度总结
        </Link>
      </div>

      <div className="charts-2col" style={{ marginBottom: 16 }}>
        <div className="card chart-card">
          <div className="t">集团分布（按晚数）</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={groupData} dataKey="nights" nameKey="name"
                cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={3} strokeWidth={0}>
                {groupData.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 晚`]} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", justifyContent: "center", paddingBottom: 8 }}>
            {groupData.map((d) => (
              <span key={d.name} style={{ fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <i style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, display: "inline-block" }} />
                {d.name} {d.nights}晚
              </span>
            ))}
          </div>
        </div>

        <div className="card chart-card">
          <div className="t">历年住宿晚数</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={yearlyTrend} barSize={42}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" stroke="var(--faint)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--faint)" fontSize={12} tickLine={false} axisLine={false} width={30} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 晚`, "晚数"]} cursor={{ fill: "var(--surface-2)" }} />
              <Bar dataKey="nights" fill="var(--brass)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="charts-2col" style={{ marginBottom: 16 }}>
        <div className="card chart-card">
          <div className="t">历年支出与均价（CNY）</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={yearlyTrend}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" stroke="var(--faint)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--faint)" fontSize={12} tickLine={false} axisLine={false} width={54}
                tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v, name) => [`¥${Number(v ?? 0).toLocaleString()}`, name === "spend" ? "总支出" : "日均房价"]} />
              <Line type="monotone" dataKey="spend" stroke="var(--brass)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="avg" stroke="var(--good)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-card">
          <div className="t">个人评分分布</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ratingDist} barSize={36}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="star" stroke="var(--faint)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} stroke="var(--faint)" fontSize={12} tickLine={false} axisLine={false} width={30} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 次`]} cursor={{ fill: "var(--surface-2)" }} />
              <Bar dataKey="count" fill="var(--brass)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="charts-2col">
        <div className="card chart-card" style={{ paddingBottom: 18 }}>
          <div className="t">城市排行（按晚数）</div>
          <div className="rank-list">
            {cities.map((c, i) => (
              <div key={c.city} className="rank-row">
                <span className="idx mono">{i + 1}</span>
                <span>{c.city}</span>
                <div className="bar-bg"><i style={{ width: `${(c.nights / maxCityNights) * 100}%` }} /></div>
                <span className="val mono">{c.nights} 晚</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card chart-card" style={{ paddingBottom: 18 }}>
          <div className="t">积分获取效率</div>
          {pointsEfficiency != null ? (
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              <div className="mono" style={{ fontSize: 44, color: "var(--brass)" }}>{pointsEfficiency}</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>积分 / 每元房费（仅统计 CNY 现金房）</div>
              <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 10 }}>
                含会籍加成与促销；数值越高，付费住宿的回血越好
              </div>
            </div>
          ) : (
            <div style={{ padding: "30px 0", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
              录入房价与获得积分后可计算
            </div>
          )}
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 6 }}>
            <div className="t">往年总结</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {years.map((y) => (
                <Link key={y} to={`/stats/wrapped/${y}`} className="btn" style={{ textDecoration: "none" }}>
                  {y} 年度总结
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
