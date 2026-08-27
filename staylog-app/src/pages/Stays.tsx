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
import { toast } from "../components/Toast";
import EmptyState from "../components/EmptyState";
import type { LoyaltyGroup, Stay } from "../types";
import { GROUP_META } from "../types";
import { IconClipboard, IconPlus } from "../components/Icons";

const LS_KEY = "staylog.staysFilters.v1";

interface StaysFilters {
  q: string;
  group: "" | LoyaltyGroup;
  year: string;
}

function loadFilters(): StaysFilters | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<StaysFilters>;
    return { q: String(o.q ?? ""), group: (o.group ?? "") as "" | LoyaltyGroup, year: String(o.year ?? "") };
  } catch {
    return null;
  }
}

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
  const [q, setQ] = useState(() => searchParams.get("q") ?? loadFilters()?.q ?? "");
  const [groupFilter, setGroupFilter] = useState<"" | LoyaltyGroup>(() => loadFilters()?.group ?? "");
  // URL 参数 ?filter=upcoming 优先于本地快照（如首页倒计时卡跳转）
  const [yearFilter, setYearFilter] = useState(() =>
    searchParams.get("filter") === "upcoming" ? "upcoming" : loadFilters()?.year ?? ""
  );

  // 从地图"查看入住记录"跳转带 ?q= 时预填搜索框（已挂载页 SPA 跳转也生效）
  useEffect(() => {
    const qp = searchParams.get("q");
    if (qp) setQ(qp);
    if (searchParams.get("filter") === "upcoming") setYearFilter("upcoming");
  }, [searchParams]);

  // 筛选持久化：同会话内跨页面来回不丢筛选状态
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ q, group: groupFilter, year: yearFilter }));
    } catch { /* 隐私模式写不进去就静默 */ }
  }, [q, groupFilter, yearFilter]);


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

  /** 年份 chip 选项：即将入住置顶 + 有数据的年份倒序 */
  const yearChips = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    if (upcomingCount > 0) list.push({ value: "upcoming", label: `即将入住（${upcomingCount}）` });
    for (const y of years) list.push({ value: String(y), label: String(y) });
    return list;
  }, [years, upcomingCount]);

  /** 集团 chip 选项：只列出实际出现过的集团 */
  const groupChips = useMemo(() => {
    const present = new Set(stays.map((s) => s.group));
    return Object.entries(GROUP_META).filter(([k]) => present.has(k as LoyaltyGroup));
  }, [stays]);

  function toggleYear(v: string) {
    setYearFilter((cur) => (cur === v ? "" : v));
  }
  function toggleGroup(v: "" | LoyaltyGroup) {
    setGroupFilter((cur) => (cur === v ? "" : v));
  }

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
    toast(formMode === "edit" ? "已保存修改" : "已新增记录");
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
            {(q || groupFilter || yearFilter) && (
              <button className="btn btn-ghost btn-xs" onClick={() => { setQ(""); setGroupFilter(""); setYearFilter(""); }}>
                清除筛选（{filtered.length} 条）
              </button>
            )}
          </div>
          <div className="chip-row" role="group" aria-label="按年份筛选">
            {yearChips.map((c) => (
              <button key={c.value} type="button"
                className={`chip filter-chip${yearFilter === c.value ? " on" : ""}`}
                aria-pressed={yearFilter === c.value}
                onClick={() => toggleYear(c.value)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="chip-row" role="group" aria-label="按集团筛选">
            {groupChips.map(([k, m]) => (
              <button key={k} type="button"
                className={`chip filter-chip ${m.className}${groupFilter === k ? " on" : ""}`}
                aria-pressed={groupFilter === k}
                onClick={() => toggleGroup(k as LoyaltyGroup)}>
                {m.name}
              </button>
            ))}
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
        onConfirm={() => { if (deleting) { removeStay(deleting.id); toast("已删除记录"); } setDeleting(null); }}
        onCancel={() => setDeleting(null)}
      />
    </main>
  );
}
