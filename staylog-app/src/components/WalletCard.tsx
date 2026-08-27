import dayjs from "dayjs";
import type { Membership, Stay } from "../types";
import { GROUP_META } from "../types";
import { recentMonthlyPace, tierProgress } from "../lib/stats";
import { IconAward, IconEdit, IconTrash } from "./Icons";

interface Props {
  membership: Membership;
  stays: Stay[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: (m: Membership) => void;
  onDelete: (m: Membership) => void;
}

// 按集团+等级复刻真实卡面配色（CSS 皮肤类见 app.css）。
// 华住：星/银/金为浅卡（配深色文字 is-light），铂金为深卡。
// 希尔顿：会员=默认蓝深卡，银=浅银(is-light)、金=香槟金(is-light)、钻石=石墨深卡、曜钻=近黑深卡。
// 其余集团/等级用默认宝石深卡（wallet-card 基础样式）。
function cardSkin(group: string, tierName: string): string {
  if (group === "huazhu") {
    if (tierName.includes("铂金")) return "skin-hz-plat";
    if (tierName.includes("金")) return "skin-hz-gold is-light";
    if (tierName.includes("银")) return "skin-hz-silver is-light";
    if (tierName.includes("星")) return "skin-hz-star is-light";
    return "";
  }
  if (group === "hilton") {
    if (tierName.includes("曜钻")) return "skin-hh-diamondplus";
    if (tierName.includes("钻石")) return "skin-hh-diamond";
    if (tierName.includes("金")) return "skin-hh-gold is-light";
    if (tierName.includes("银")) return "skin-hh-silver is-light";
    return ""; // 会员：默认希尔顿蓝深卡
  }
  return "";
}

export default function WalletCard({ membership: m, stays, expanded, onToggle, onEdit, onDelete }: Props) {
  const meta = GROUP_META[m.group] ?? GROUP_META.other;
  const year = dayjs().year();
  const tp = tierProgress(m, stays, year);
  const yearNights = tp.progress - m.bonusNights;

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
  // 卡面主色：用 CSS 变量（随深/浅色主题实时变），other 用自定义色或回退到 --other
  const tint =
    m.group === "other" && m.customColor ? m.customColor : `var(${meta.cssVar})`;
  const tierLabel = tp.currentEn ? `${tp.currentName} ${tp.currentEn}` : tp.currentName;
  // 华住按等级复刻真实卡面（星/银/金=浅卡、铂金=深卡）；其余集团用宝石深卡
  const skin = cardSkin(m.group, tp.currentName);

  return (
    <div
      className={`wallet-card ${skin} ${expanded ? "expanded" : ""}`}
      style={{ ["--tint" as string]: tint }}
    >
      {/* 表头：始终可见，收起态只露这条；整条点击展开/收起 */}
      <button className="wc-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="wc-brand">
          <span className="wc-logo"><IconAward width={16} height={16} /></span>
          <span className="wc-names">
            <span className="wc-name">{name}</span>
            <span className="wc-en">{en}</span>
          </span>
        </span>
        <span className="wc-tier">{tierLabel}</span>
      </button>

      {/* 磁条：房卡标志物 */}
      <div className="wc-magstripe" aria-hidden="true" />

      {/* 收起态摘要行（一眼看积分/本年晚数） */}
      <div className="wc-summary">
        <span>积分 <b className="mono">{m.pointsBalance.toLocaleString()}</b></span>
        <span>本年 <b className="mono">{yearNights}</b> 晚</span>
      </div>

      {/* 展开体 */}
      <div className="wc-body">
        <div className="wc-track">
          <div className="cap">
            <span>
              {tp.mode === "upgrade" ? `冲刺 ${tp.targetName}` : tp.mode === "top" ? "已达最高等级" : tp.targetName || "定级进度"}
            </span>
            <b className="mono">{tp.progress} / {tp.threshold} 晚</b>
          </div>
          <div className="rail"><i style={{ width: `${tp.pct}%` }} /></div>
          <div className="wc-note">
            {tp.mode === "top"
              ? "已达最高等级 ✓"
              : tp.remaining > 0
                ? `还差 ${tp.remaining} 晚${tp.targetName ? `升级${tp.targetName}` : ""}`
                : "目标已达成 ✓"}
            {forecast && ` · ${forecast}`}
          </div>
        </div>

        {(m.bonusNights > 0 || m.tierExpiry) && (
          <div className="wc-facts">
            {m.bonusNights > 0 && <span>赠晚 <b className="mono">+{m.bonusNights}</b></span>}
            {m.tierExpiry && <span>等级有效期至 {m.tierExpiry}</span>}
          </div>
        )}

        {m.certificates.length > 0 && (
          <div className="wc-certs">
            {m.certificates.map((c, i) => (
              <span key={i} className="wc-cert">🎫 {c.name}<em> · {c.expiry}</em></span>
            ))}
          </div>
        )}

        <div className="wc-actions">
          <button onClick={() => onEdit(m)}><IconEdit width={12} height={12} /> 编辑</button>
          <button className="del" onClick={() => onDelete(m)}><IconTrash width={12} height={12} /> 删除</button>
        </div>
      </div>
    </div>
  );
}
