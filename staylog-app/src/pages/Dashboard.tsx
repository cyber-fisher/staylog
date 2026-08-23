import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { useStaylog } from "../store/staylog";
import { monthlyNights, summarizeYear } from "../lib/stats";
import StayCard from "../components/StayCard";
import StayForm from "../components/StayForm";
import EmptyState from "../components/EmptyState";
import type { Stay } from "../types";
import { IconPlus } from "../components/Icons";

const MONTH_LABELS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

export default function Dashboard() {
  const stays = useStaylog((s) => s.stays);
  const addStay = useStaylog((s) => s.addStay);
  const [formOpen, setFormOpen] = useState(false);
  const year = dayjs().year();

  const summary = useMemo(() => summarizeYear(stays, year), [stays, year]);
  const months = useMemo(() => monthlyNights(stays, year), [stays, year]);
  const maxMonth = Math.max(1, ...months);
  const recent = useMemo(() => stays.slice(0, 5), [stays]);

  if (stays.length === 0) {
    return (
      <main className="page">
        <EmptyState onAdd={() => setFormOpen(true)} />
        <StayForm open={formOpen} onSave={(s) => { addStay(s); setFormOpen(false); }} onClose={() => setFormOpen(false)} />
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="hero-greet" style={{ color: "var(--muted)", fontSize: 13, letterSpacing: ".08em", marginBottom: 6 }}>
            {dayjs().format("YYYY年M月D日")}
          </div>
          <h1 className="serif">
            今年住了 <em style={{ color: "var(--brass)", fontStyle: "normal" }}>{summary.nights}</em> 晚
          </h1>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
          <IconPlus width={14} height={14} /> 新增记录
        </button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 40 }}>
        <div className="card stat">
          <div className="k">住宿晚数</div>
          <div className="v mono">{summary.nights}<small>晚</small></div>
        </div>
        <div className="card stat">
          <div className="k">入住酒店</div>
          <div className="v mono">{summary.hotels}<small>家</small></div>
        </div>
        <div className="card stat">
          <div className="k">到访城市</div>
          <div className="v mono">{summary.cities}<small>座</small></div>
          {summary.newCities.length > 0 && <div className="d">新增 {summary.newCities.length} 座</div>}
        </div>
        <div className="card stat">
          <div className="k">到访国家/地区</div>
          <div className="v mono">{summary.countries}</div>
          {summary.newCountries.length > 0 && <div className="d">新增 {summary.newCountries.length} 个</div>}
        </div>
        <div className="card stat">
          <div className="k">累计获得积分</div>
          <div className="v mono">{summary.pointsEarned.toLocaleString()}</div>
        </div>
        <div className="card stat">
          <div className="k">住宿支出</div>
          <div className="v mono">¥{summary.spendCny.toLocaleString()}</div>
          {summary.avgRateCny != null && <div className="d neg">日均 ¥{summary.avgRateCny}</div>}
        </div>
      </div>

      <div className="card chart-card" style={{ marginBottom: 44 }}>
        <div className="t">{year} 年月度住宿晚数</div>
        <div className="bars" style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 96 }}>
          {months.map((n, i) => (
            <div key={i} className="bar" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
              <div className="n mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>{n || ""}</div>
              <i style={{
                display: "block", width: "100%", maxWidth: 38, borderRadius: "4px 4px 0 0",
                minHeight: 2, height: `${Math.max(2, (n / maxMonth) * 100)}%`,
                background: n > 0 ? "linear-gradient(180deg,var(--brass),rgba(212,168,83,.45))" : "var(--surface-2)",
              }} />
              <b style={{ fontSize: 10.5, color: "var(--faint)", fontWeight: 400 }}>{MONTH_LABELS[i]}</b>
            </div>
          ))}
        </div>
      </div>

      <section>
        <div className="sec-head">
          <h2 className="serif">近期入住</h2>
          <span className="en">RECENT STAYS</span>
          <div className="rule" />
        </div>
        {recent.map((s: Stay) => <StayCard key={s.id} stay={s} />)}
      </section>

      <StayForm open={formOpen} onSave={(s) => { addStay(s); setFormOpen(false); }} onClose={() => setFormOpen(false)} />
    </main>
  );
}
