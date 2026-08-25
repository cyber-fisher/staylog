import dayjs from "dayjs";
import type { Membership, Stay } from "../types";
import { GROUP_META } from "../types";
import { recentMonthlyPace, tierProgress } from "../lib/stats";
import { IconEdit, IconTrash } from "./Icons";

interface Props {
  membership: Membership;
  stays: Stay[];
  compact?: boolean;
  onEdit?: (m: Membership) => void;
  onDelete?: (m: Membership) => void;
}

export default function ProgramCard({ membership: m, stays, compact, onEdit, onDelete }: Props) {
  const meta = GROUP_META[m.group];
  const year = dayjs().year();
  const tp = tierProgress(m, stays, year);
  const yearNights = tp.progress - m.bonusNights;

  // 达成预测：按近 6 个月该集团月均晚数外推
  const groupStays = stays.filter((s) => s.group === m.group);
  const pace = recentMonthlyPace(groupStays, 6);
  let forecast: string | null = null;
  if (tp.remaining > 0 && pace > 0.1) {
    const months = Math.ceil(tp.remaining / pace);
    const eta = dayjs().add(months, "month");
    forecast = eta.year() === year ? `按当前节奏预计 ${eta.month() + 1} 月达成` : "按当前节奏本年内难以达成";
  }

  const name = m.group === "other" ? m.customName || "其他集团" : meta.name;
  const en = m.group === "other" ? "CUSTOM" : meta.en;
  const style = m.group === "other" && m.customColor ? { "--bc": m.customColor } as React.CSSProperties : undefined;
  const tierLabel = tp.currentEn ? `${tp.currentName} ${tp.currentEn}` : tp.currentName;

  return (
    <div className={`card prog ${meta.className}`} style={style}>
      {!compact && (onEdit || onDelete) && (
        <div className="prog-actions">
          {onEdit && <button onClick={() => onEdit(m)}><IconEdit width={12} height={12} /> 编辑</button>}
          {onDelete && <button onClick={() => onDelete(m)}><IconTrash width={12} height={12} /></button>}
        </div>
      )}
      <div className="row1">
        <div>
          <div className="name">{name}</div>
          <div className="en-name">{en}</div>
        </div>
        <span className="tier-badge">{tierLabel}</span>
      </div>
      <div className="pts">
        <div>
          <div className="k">积分余额</div>
          <div className="v mono">{m.pointsBalance.toLocaleString()}</div>
        </div>
        <div>
          <div className="k">本年入住</div>
          <div className="v mono">{yearNights} 晚</div>
        </div>
        {!compact && m.bonusNights > 0 && (
          <div>
            <div className="k">赠晚</div>
            <div className="v mono">+{m.bonusNights}</div>
          </div>
        )}
      </div>
      <div className="track">
        <div className="cap">
          <span>
            {tp.mode === "upgrade" ? `冲刺 ${tp.targetName}` : tp.mode === "top" ? "已达最高等级" : tp.targetName || "定级进度"}
          </span>
          <b className="mono">{tp.progress} / {tp.threshold} 晚</b>
        </div>
        <div className="rail"><i style={{ width: `${tp.pct}%` }} /></div>
      </div>
      {!compact && (
        <div className="note">
          {tp.mode === "top"
            ? "已达最高等级 ✓"
            : tp.remaining > 0
              ? `还差 ${tp.remaining} 晚${tp.targetName ? `升级${tp.targetName}` : ""}`
              : "目标已达成 ✓"}
          {forecast && ` · ${forecast}`}
          {m.tierExpiry && ` · 等级有效期至 ${m.tierExpiry}`}
        </div>
      )}
    </div>
  );
}
