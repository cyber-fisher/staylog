import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import { useStaylog } from "../store/staylog";
import { isUpcoming, nightsOf, yearsWithData } from "../lib/stats";
import { repeatDraft } from "../lib/stayDraft";
import StayCard from "../components/StayCard";
import StayForm from "../components/StayForm";
import ImportPasteDialog from "../components/ImportPasteDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import type { LoyaltyGroup, Stay } from "../types";
import { GROUP_META } from "../types";
import { IconClipboard, IconPlus } from "../components/Icons";

export default function Stays() {
  const stays = useStaylog((s) => s.stays);
  const addStay = useStaylog((s) => s.addStay);
  const updateStay = useStaylog((s) => s.updateStay);
  const removeStay = useStaylog((s) => s.removeStay);

  const [searchParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  // 表单「模式」与「初值」必须分开：「再住一次」和「粘贴导入」都是 initial 有值
  // 但要走 addStay，靠 editing 是否为空来区分会把新记录写成覆盖编辑。
  const [formMode, setFormMode] = useState<"new" | "edit">("new");
  const [formInitial, setFormInitial] = useState<Stay | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
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
  const upcomingCount = useMemo(() => stays.filter(isUpcoming).length, [stays]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return stays.filter((s) => {
      if (groupFilter && s.group !== groupFilter) return false;
      // 年份下拉里 "upcoming" 是特殊值：只看已订未住，不按年份比对
      if (yearFilter === "upcoming") {
        if (!isUpcoming(s)) return false;
      } else if (yearFilter && String(dayjs(s.checkIn).year()) !== yearFilter) return false;
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

  function openNew() {
    setFormMode("new");
    setFormInitial(null);
    setFormOpen(true);
  }
  function openEdit(stay: Stay) {
    setFormMode("edit");
    setFormInitial(stay);
    setFormOpen(true);
  }
  /** 「再住一次」：同一家酒店换日期新开一条，不覆盖原记录 */
  function openRepeat(src: Stay) {
    setFormMode("new");
    setFormInitial(repeatDraft(src));
    setFormOpen(true);
  }
  /** 粘贴导入解析完的草稿：仍走 StayForm 做确认，复用它的校验与高德补全 */
  function openFromDraft(draft: Stay) {
    setFormMode("new");
    setFormInitial(draft);
    setPasteOpen(false);
    setFormOpen(true);
  }

  function save(stay: Stay) {
    if (formMode === "edit") updateStay(stay.id, stay);
    else addStay(stay);
    setFormOpen(false);
    setFormInitial(null);
  }
  function closeForm() {
    setFormOpen(false);
    setFormInitial(null);
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="serif">住宿记录</h1>
          <div className="sub">共 {stays.length} 条记录 · {stays.reduce((n, s) => n + nightsOf(s), 0)} 晚</div>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => setPasteOpen(true)}>
            <IconClipboard width={14} height={14} /> 粘贴导入
          </button>
          <button className="btn btn-primary" onClick={openNew}>
            <IconPlus width={14} height={14} /> 新增记录
          </button>
        </div>
      </div>

      {stays.length === 0 ? (
        <EmptyState onAdd={openNew} />
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
              {upcomingCount > 0 && <option value="upcoming">即将入住（{upcomingCount}）</option>}
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
                  onEdit={openEdit}
                  onRepeat={openRepeat}
                  onDelete={(st) => setDeleting(st)} />
              ))}
            </section>
          ))}
        </>
      )}

      <StayForm open={formOpen} initial={formInitial}
        onSave={save} onClose={closeForm} />
      <ImportPasteDialog open={pasteOpen} onClose={() => setPasteOpen(false)} onApply={openFromDraft} />
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
