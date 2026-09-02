import dayjs from "dayjs";
import type { Membership, Stay } from "../types";
import { GROUP_META } from "../types";
import { tierProgress, tierProjection } from "../lib/stats";
import { IconAward, IconEdit, IconTrash, IconChip, IconContactless, IconTicket, IconCheck } from "./Icons";

interface Props {
  membership: Membership;
  stays: Stay[];
  isActive?: boolean;
  isStacked?: boolean;
  stackIndex?: number;
  totalStacked?: number;
  onSelect?: () => void;
  onClose?: () => void;
  onEdit: (m: Membership) => void;
  onDelete: (m: Membership) => void;
}

// 按集团+等级复刻真实卡面配色（CSS 皮肤类见 app.css）。
// 华住：星/银/金为浅卡（配深色文字 is-light），铂金为深卡。
// 希尔顿：会员=默认蓝深卡，银=浅银(is-light)、金=香槟金(is-light)、钻石=石墨深卡、曜钻=近黑深卡。
// 其余集团/等级用默认宝石深卡。
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

// 格式化卡号展示（如 8 位以上转为 Apple 风格的掩码，短卡号直接展示）
function formatMemberNo(no?: string): string {
  if (!no) return "•••• •••• •••• 8820";
  const clean = no.trim();
  if (clean.length > 8) {
    return `•••• •••• ${clean.slice(-4)}`;
  }
  return clean;
}

export default function WalletCard({
  membership: m,
  stays,
  isActive = false,
  isStacked = false,
  stackIndex = 0,
  onSelect,
  onEdit,
  onDelete,
}: Props) {
  const meta = GROUP_META[m.group] ?? GROUP_META.other;
  const year = dayjs().year();
  const tp = tierProgress(m, stays, year);
  const yearNights = tp.progress - m.bonusNights;
  // 规划器：叠加已订未住的晚数，回答「加上手上的预订能到哪」。ETA 逻辑在 stats.ts。
  const proj = tierProjection(m, stays, year);
  const forecast = proj.etaLabel;
  // 进度轨里已订段的宽度：只画超出已住部分的增量，避免和已住段重叠
  const bookedPct = Math.max(0, proj.projectedPct - tp.pct);

  const name = m.group === "other" ? m.customName || "其他集团" : meta.name;
  const en = m.group === "other" ? "HOTEL PASS" : meta.en;
  // 卡面主色：用 CSS 变量（随深/浅色主题实时变），other 用自定义色或回退到 --other
  const tint =
    m.group === "other" && m.customColor ? m.customColor : `var(${meta.cssVar})`;
  const tierLabel = tp.currentEn ? `${tp.currentName} ${tp.currentEn}` : tp.currentName;
  // 华住/希尔顿等真实卡面皮肤
  const skin = cardSkin(m.group, tp.currentName);

  return (
    <div
      className={`apple-wallet-card-wrapper ${isStacked ? "in-stack" : "standalone"} ${
        isActive ? "is-active" : ""
      }`}
      style={{
        ["--stack-idx" as string]: stackIndex,
        ["--tint" as string]: tint,
      }}
    >
      {/* ===== Apple Wallet 卡片主体 ===== */}
      <div
        className={`apple-pass-card ${skin}`}
        onClick={onSelect}
        role={isStacked ? "button" : undefined}
        tabIndex={isStacked ? 0 : undefined}
        aria-label={`${name} ${tp.currentName}`}
      >
        {/* 卡面微光高光与暗纹 */}
        <div className="aw-specular" aria-hidden="true" />
        <div className="aw-watermark" aria-hidden="true">{meta.short || name}</div>

        {/* 卡片头部：品牌 + 等级徽章 */}
        <div className="aw-head">
          <div className="aw-brand">
            <div className="aw-logo-chip">
              <IconAward width={16} height={16} />
            </div>
            <div className="aw-brand-titles">
              <span className="aw-brand-name">{name}</span>
              <span className="aw-brand-en">{en}</span>
            </div>
          </div>
          <div className="aw-tier-pill">{tierLabel}</div>
        </div>

        {/* 卡片中部：金属智能芯片 + 无线感应标 与 积分主视觉 */}
        <div className="aw-body">
          <div className="aw-chip-row">
            <div className="aw-emv-chip" title="EMV Smart Chip">
              <IconChip width={32} height={23} />
            </div>
            <div className="aw-contactless" title="Contactless">
              <IconContactless width={16} height={16} />
            </div>
          </div>
          <div className="aw-balance-group">
            <span className="aw-balance-label">POINTS BALANCE · 积分</span>
            <div className="aw-balance-val mono">{m.pointsBalance.toLocaleString()}</div>
          </div>
        </div>

        {/* 磁条 / 装饰分隔条 */}
        <div className="aw-magstripe" aria-hidden="true" />

        {/* 卡片底部：卡号 & 简明速览 */}
        <div className="aw-foot">
          <div className="aw-member-no mono">
            <span className="aw-label">MEMBER</span>
            {formatMemberNo(m.memberNo)}
          </div>
          <div className="aw-quick-stats">
            <span>本年 <b className="mono">{yearNights}</b> 晚</span>
            {tp.mode !== "top" && tp.remaining > 0 && (
              <span className="aw-rem">差 <b className="mono">{tp.remaining}</b> 晚</span>
            )}
          </div>
        </div>
      </div>

      {/* ===== 抽发展开态下的 Apple 风格详情面板 (Pass Sheet) ===== */}
      {isActive && (
        <div className="apple-pass-sheet animate-slide-up">
          {/* 1. 定级进度与预测 */}
          <div className="aw-section">
            <div className="aw-section-head">
              <span className="aw-section-title">
                {tp.mode === "upgrade"
                  ? `冲刺 ${tp.targetName}`
                  : tp.mode === "top"
                  ? "已达最高等级"
                  : tp.targetName || "定级进度"}
              </span>
              <span className="aw-section-val mono">
                {tp.progress} / {tp.threshold} 晚
              </span>
            </div>

            <div className="aw-progress-rail">
              <i style={{ width: `${Math.min(100, tp.pct)}%` }} />
              {bookedPct > 0 && (
                <i
                  className="projected"
                  style={{
                    left: `${Math.min(100, tp.pct)}%`,
                    width: `${Math.min(100 - tp.pct, bookedPct)}%`,
                  }}
                />
              )}
            </div>

            <div className="aw-progress-note">
              {tp.mode === "top" ? (
                <span className="aw-status-ok"><IconCheck width={13} height={13} /> 已达最高等级</span>
              ) : tp.remaining > 0 ? (
                <span>还差 <b className="mono">{tp.remaining}</b> 晚{tp.targetName ? `升级${tp.targetName}` : ""}</span>
              ) : (
                <span className="aw-status-ok"><IconCheck width={13} height={13} /> 目标已达成</span>
              )}
              {forecast && <span className="aw-forecast"> · {forecast}</span>}
            </div>

            {proj.upcomingNights > 0 && tp.mode !== "top" && tp.remaining > 0 && (
              <div className="aw-projected-callout">
                含已订 <b className="mono">{proj.upcomingNights}</b> 晚 → 可达{" "}
                <b className="mono">{proj.projected} / {tp.threshold}</b>
                {proj.remainingAfterBooked > 0
                  ? `，届时还差 ${proj.remainingAfterBooked} 晚`
                  : "，届时即可达成 ✓"}
              </div>
            )}
          </div>

          {/* 2. 核心参数网格 */}
          <div className="aw-grid">
            <div className="aw-grid-tile">
              <span className="lbl">本年入住</span>
              <span className="val mono">{yearNights} <em>晚</em></span>
            </div>
            <div className="aw-grid-tile">
              <span className="lbl">赠晚奖励</span>
              <span className="val mono">+{m.bonusNights} <em>晚</em></span>
            </div>
            <div className="aw-grid-tile">
              <span className="lbl">积分余额</span>
              <span className="val mono">{m.pointsBalance.toLocaleString()}</span>
            </div>
            <div className="aw-grid-tile">
              <span className="lbl">等级有效期</span>
              <span className="val mono">{m.tierExpiry || "长期有效"}</span>
            </div>
          </div>

          {/* 3. 专属卡券包 (Apple Ticket 拟物票券) */}
          {m.certificates.length > 0 && (
            <div className="aw-vouchers-group">
              <div className="aw-vouchers-title">
                <IconTicket width={14} height={14} /> 权益券与房券 ({m.certificates.length})
              </div>
              <div className="aw-vouchers-list">
                {m.certificates.map((c, i) => {
                  const days = dayjs(c.expiry).diff(dayjs(), "day");
                  const isExpiringSoon = days <= 30 && days >= 0;
                  const isExpired = days < 0;
                  return (
                    <div key={i} className={`aw-voucher-ticket ${isExpiringSoon ? "expiring" : ""} ${isExpired ? "expired" : ""}`}>
                      <div className="aw-vt-stub">
                        <IconTicket width={18} height={18} />
                      </div>
                      <div className="aw-vt-body">
                        <div className="aw-vt-name">{c.name || "未命名卡券"}</div>
                        <div className="aw-vt-date">
                          有效期至 {c.expiry}
                          {isExpired ? " · 已过期" : isExpiringSoon ? ` · 仅剩 ${days} 天` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. 操作管理按钮 */}
          <div className="aw-actions-row">
            <button className="aw-btn-action" onClick={() => onEdit(m)}>
              <IconEdit width={14} height={14} /> 编辑会籍
            </button>
            <button className="aw-btn-action danger" onClick={() => onDelete(m)}>
              <IconTrash width={14} height={14} /> 删除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
