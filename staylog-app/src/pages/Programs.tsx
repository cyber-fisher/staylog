import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { useStaylog } from "../store/staylog";
import ProgramCard from "../components/ProgramCard";
import ConfirmDialog from "../components/ConfirmDialog";
import type { LoyaltyGroup, Membership } from "../types";
import { GROUP_META } from "../types";
import { IconPlus, IconX } from "../components/Icons";

interface ExpiryEntry {
  label: string;
  date: string;
  days: number;
  groupName: string;
}

function blankMembership(): Membership {
  return {
    id: crypto.randomUUID(),
    group: "hilton",
    tier: "",
    pointsBalance: 0,
    targetNights: 0,
    bonusNights: 0,
    certificates: [],
  };
}

export default function Programs() {
  const stays = useStaylog((s) => s.stays);
  const memberships = useStaylog((s) => s.memberships);
  const upsertMembership = useStaylog((s) => s.upsertMembership);
  const removeMembership = useStaylog((s) => s.removeMembership);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Membership | null>(null);
  const [form, setForm] = useState<Membership>(blankMembership());
  const [deleting, setDeleting] = useState<Membership | null>(null);

  const expiries = useMemo<ExpiryEntry[]>(() => {
    const now = dayjs();
    const out: ExpiryEntry[] = [];
    for (const m of memberships) {
      const name = m.group === "other" ? m.customName || "其他" : GROUP_META[m.group].name;
      if (m.tierExpiry) {
        out.push({ label: `${m.tier} 等级到期`, date: m.tierExpiry, days: dayjs(m.tierExpiry).diff(now, "day"), groupName: name });
      }
      for (const c of m.certificates) {
        out.push({ label: c.name, date: c.expiry, days: dayjs(c.expiry).diff(now, "day"), groupName: name });
      }
    }
    return out.filter((e) => e.days > -30).sort((a, b) => a.days - b.days);
  }, [memberships]);

  function openEdit(m: Membership) {
    setEditing(m);
    setForm({ ...m, certificates: [...m.certificates] });
    setFormOpen(true);
  }
  function openNew() {
    setEditing(null);
    setForm(blankMembership());
    setFormOpen(true);
  }
  function set<K extends keyof Membership>(key: K, value: Membership[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="serif">常旅客计划</h1>
          <div className="sub">定级进度由住宿记录自动累计，赠晚可手动补偿</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <IconPlus width={14} height={14} /> 添加计划
        </button>
      </div>

      {expiries.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <div className="sec-head">
            <h2 className="serif">到期提醒</h2>
            <span className="en">EXPIRING</span>
            <div className="rule" />
          </div>
          <div className="expiry-list">
            {expiries.map((e, i) => (
              <div key={i} className={`expiry-item ${e.days <= 90 ? "soon" : ""}`}>
                <span style={{ color: "var(--muted)" }}>{e.groupName}</span>
                <span>{e.label}</span>
                <span className="days mono">
                  {e.days < 0 ? `已过期 ${-e.days} 天` : e.days === 0 ? "今天到期" : `${e.days} 天后 · ${e.date}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {memberships.length === 0 ? (
        <div className="card empty">
          <h2 className="serif">还没有添加常旅客计划</h2>
          <p>添加希尔顿、万豪、IHG、凯悦等会籍后，每次录入住宿都会自动累计定级进度。</p>
          <div className="row">
            <button className="btn btn-primary" onClick={openNew}>
              <IconPlus width={14} height={14} /> 添加计划
            </button>
          </div>
        </div>
      ) : (
        <div className="programs-grid">
          {memberships.map((m) => (
            <ProgramCard key={m.id} membership={m} stays={stays}
              onEdit={openEdit} onDelete={(x) => setDeleting(x)} />
          ))}
        </div>
      )}

      {formOpen && (
        <>
          <div className="drawer-mask" onClick={() => setFormOpen(false)} />
          <form className="drawer" onSubmit={(e) => { e.preventDefault(); upsertMembership(form); setFormOpen(false); }}>
            <div className="drawer-head">
              <h2>{editing ? "编辑会籍" : "添加常旅客计划"}</h2>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="关闭"><IconX /></button>
            </div>
            <div className="drawer-body">
              <div className="field">
                <label htmlFor="m-group">集团</label>
                <select id="m-group" value={form.group} disabled={!!editing}
                  onChange={(e) => set("group", e.target.value as LoyaltyGroup)}>
                  {Object.entries(GROUP_META).map(([k, meta]) => (
                    <option key={k} value={k}>{meta.name}</option>
                  ))}
                </select>
              </div>
              {form.group === "other" && (
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="m-custom">集团名称</label>
                    <input id="m-custom" required value={form.customName || ""}
                      onChange={(e) => set("customName", e.target.value)} placeholder="雅高心悦界" />
                  </div>
                  <div className="field">
                    <label htmlFor="m-color">主题色</label>
                    <input id="m-color" type="color" value={form.customColor || "#7a8499"}
                      onChange={(e) => set("customColor", e.target.value)} style={{ height: 38, padding: 4 }} />
                  </div>
                </div>
              )}
              <div className="field-row">
                <div className="field">
                  <label htmlFor="m-tier">当前等级</label>
                  <input id="m-tier" required value={form.tier}
                    onChange={(e) => set("tier", e.target.value)} placeholder="钻石会员 DIAMOND" />
                </div>
                <div className="field">
                  <label htmlFor="m-no">会员号（选填）</label>
                  <input id="m-no" value={form.memberNo || ""}
                    onChange={(e) => set("memberNo", e.target.value)} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="m-pts">积分余额</label>
                  <input id="m-pts" type="number" min={0} value={form.pointsBalance}
                    onChange={(e) => set("pointsBalance", Number(e.target.value) || 0)} />
                </div>
                <div className="field">
                  <label htmlFor="m-expiry">等级到期日（选填）</label>
                  <input id="m-expiry" type="date" value={form.tierExpiry || ""}
                    onChange={(e) => set("tierExpiry", e.target.value || undefined)} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="m-target">冲刺目标（选填）</label>
                  <input id="m-target" value={form.targetTier || ""}
                    onChange={(e) => set("targetTier", e.target.value || undefined)} placeholder="钻石续级 / 升级钛金" />
                </div>
                <div className="field">
                  <label htmlFor="m-target-n">目标所需晚数</label>
                  <input id="m-target-n" type="number" min={0} value={form.targetNights}
                    onChange={(e) => set("targetNights", Number(e.target.value) || 0)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="m-bonus">赠晚（信用卡等非入住晚数）</label>
                <input id="m-bonus" type="number" min={0} value={form.bonusNights}
                  onChange={(e) => set("bonusNights", Number(e.target.value) || 0)} />
                <div className="hint">定级进度 = 本年住宿晚数（自动统计）+ 赠晚</div>
              </div>
              <div className="field">
                <label>权益券 / 免房券</label>
                {form.certificates.map((c, i) => (
                  <div key={i} className="field-row" style={{ marginBottom: 8 }}>
                    <input value={c.name} placeholder="套房升级券"
                      onChange={(e) => {
                        const next = [...form.certificates];
                        next[i] = { ...next[i], name: e.target.value };
                        set("certificates", next);
                      }} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="date" value={c.expiry}
                        onChange={(e) => {
                          const next = [...form.certificates];
                          next[i] = { ...next[i], expiry: e.target.value };
                          set("certificates", next);
                        }} />
                      <button type="button" className="btn" aria-label="移除此券"
                        onClick={() => set("certificates", form.certificates.filter((_, j) => j !== i))}>
                        <IconX width={12} height={12} />
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn"
                  onClick={() => set("certificates", [...form.certificates, { name: "", expiry: dayjs().add(6, "month").format("YYYY-MM-DD") }])}>
                  <IconPlus width={12} height={12} /> 添加权益券
                </button>
              </div>
            </div>
            <div className="drawer-foot">
              <button type="button" className="btn" onClick={() => setFormOpen(false)}>取消</button>
              <button type="submit" className="btn btn-primary">保存</button>
            </div>
          </form>
        </>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="删除这个常旅客计划？"
        body={deleting ? `${deleting.group === "other" ? deleting.customName : GROUP_META[deleting.group].name} 的会籍信息将被删除（住宿记录不受影响）。` : ""}
        confirmLabel="删除"
        danger
        onConfirm={() => { if (deleting) removeMembership(deleting.id); setDeleting(null); }}
        onCancel={() => setDeleting(null)}
      />
    </main>
  );
}
