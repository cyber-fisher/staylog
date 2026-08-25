import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import { useStaylog } from "../store/staylog";
import { nightsOf, yearsWithData } from "../lib/stats";
import StayCard from "../components/StayCard";
import StayForm from "../components/StayForm";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import type { LoyaltyGroup, Stay } from "../types";
import { GROUP_META } from "../types";
import { IconPlus } from "../components/Icons";

export default function Stays() {
  const stays = useStaylog((s) => s.stays);
  const addStay = useStaylog((s) => s.addStay);
  const updateStay = useStaylog((s) => s.updateStay);
  const removeStay = useStaylog((s) => s.removeStay);

  const [searchParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Stay | null>(null);
  const [deleting, setDeleting] = useState<Stay | null>(null);
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [groupFilter, setGroupFilter] = useState<"" | LoyaltyGroup>("");
  const [yearFilter, setYearFilter] = useState("");

  // 从地图"查看入住记录"跳转带 ?q= 时预填搜索框（已挂载页 SPA 跳转也生效）
  useEffect(() => {
    const qp = searchParams.get("q");
    if (qp) setQ(qp);
  }, [searchParams]);


  const years = useMemo(() => yearsWithData(stays), [stays]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return stays.filter((s) => {
      if (groupFilter && s.group !== groupFilter) return false;
      if (yearFilter && String(dayjs(s.checkIn).year()) !== yearFilter) return false;
      if (kw) {
        const hay = `${s.hotelName} ${s.hotelNameEn || ""} ${s.city} ${s.country} ${s.brand} ${s.notes || ""} ${(s.tags || []).join(" ")}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [stays, q, groupFilter, yearFilter]);

  const byYear = useMemo(() => {
    const map = new Map<number, Stay[]>();
    for (const s of filtered) {
      const y = dayjs(s.checkIn).year();
      map.set(y, [...(map.get(y) || []), s]);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  function save(stay: Stay) {
    if (editing) updateStay(stay.id, stay);
    else addStay(stay);
    setFormOpen(false);
    setEditing(null);
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="serif">住宿记录</h1>
          <div className="sub">共 {stays.length} 条记录 · {stays.reduce((n, s) => n + nightsOf(s), 0)} 晚</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <IconPlus width={14} height={14} /> 新增记录
        </button>
      </div>

      {stays.length === 0 ? (
        <EmptyState onAdd={() => setFormOpen(true)} />
      ) : (
        <>
          <div className="filter-bar">
            <input type="search" placeholder="搜索酒店 / 城市 / 备注…" value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="搜索住宿记录" />
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value as "" | LoyaltyGroup)} aria-label="按集团筛选">
              <option value="">全部集团</option>
              {Object.entries(GROUP_META).map(([k, m]) => (
                <option key={k} value={k}>{m.name}</option>
              ))}
            </select>
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} aria-label="按年份筛选">
              <option value="">全部年份</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {(q || groupFilter || yearFilter) && (
              <span style={{ fontSize: 12, color: "var(--faint)" }}>筛选出 {filtered.length} 条</span>
            )}
          </div>

          {byYear.map(([year, list]) => (
            <section key={year}>
              <div className="year-group">
                <h3 className="serif mono">{year}</h3>
                <span className="cnt">{list.length} 次入住 · {list.reduce((n, s) => n + nightsOf(s), 0)} 晚</span>
                <div className="rule" />
              </div>
              {list.map((s) => (
                <StayCard key={s.id} stay={s}
                  onEdit={(st) => { setEditing(st); setFormOpen(true); }}
                  onDelete={(st) => setDeleting(st)} />
              ))}
            </section>
          ))}
        </>
      )}

      <StayForm open={formOpen} initial={editing}
        onSave={save} onClose={() => { setFormOpen(false); setEditing(null); }} />
      <ConfirmDialog
        open={!!deleting}
        title="删除这条住宿记录？"
        body={deleting ? `${deleting.hotelName} · ${deleting.checkIn}，删除后无法恢复。` : ""}
        confirmLabel="删除"
        danger
        onConfirm={() => { if (deleting) removeStay(deleting.id); setDeleting(null); }}
        onCancel={() => setDeleting(null)}
      />
    </main>
  );
}
