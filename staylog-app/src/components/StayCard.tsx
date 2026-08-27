import dayjs from "dayjs";
import type { Stay } from "../types";
import { GROUP_META } from "../types";
import { isUpcoming, nightsOf } from "../lib/stats";
import { IconCopy, IconEdit, IconTrash } from "./Icons";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

interface Props {
  stay: Stay;
  onEdit?: (stay: Stay) => void;
  onDelete?: (stay: Stay) => void;
  /** 以这条记录为模板新建一条（「再住一次」） */
  onRepeat?: (stay: Stay) => void;
}

export default function StayCard({ stay, onEdit, onDelete, onRepeat }: Props) {
  const ci = dayjs(stay.checkIn);
  const co = dayjs(stay.checkOut);
  const nights = nightsOf(stay);
  const meta = GROUP_META[stay.group] ?? GROUP_META.other;
  const groupLabel =
    stay.group === "other" ? stay.customGroupName || "其他" : meta.short;
  // 未来行程：虚线边框 + 倒计时 chip，与已住记录区分
  const upcoming = isUpcoming(stay);
  const daysLeft = upcoming ? ci.startOf("day").diff(dayjs().startOf("day"), "day") : 0;

  return (
    <div className={`card stay-card${upcoming ? " upcoming" : ""}`}>
      <div className="date">
        <div className="m mono">{MONTHS[ci.month()]}</div>
        <div className="d mono">
          {String(ci.date()).padStart(2, "0")}–{String(co.date()).padStart(2, "0")}
        </div>
        <div className="r">{ci.year()}</div>
      </div>
      <div>
        <div className="hotel">
          {stay.hotelName}
          {stay.hotelNameEn && <span className="en">{stay.hotelNameEn}</span>}
        </div>
        <div className="meta">
          {upcoming && <span className="chip upcoming-chip">即将入住 · {daysLeft} 天后</span>}
          <span className={`chip ${meta.className}`}>{groupLabel}</span>
          <span>{stay.city} · {stay.country}</span>
          {stay.roomType && <span>{stay.roomType}</span>}
          {stay.rating != null && <span>★ {stay.rating}</span>}
          {stay.tags?.map((t, i) => <span key={i}>#{t}</span>)}
        </div>
        {stay.notes ? <p className="stay-notes">{stay.notes}</p> : null}
      </div>
      <div className="right">
        <div className="nights mono">{nights}<small> 晚</small></div>
        {stay.pointsEarned ? (
          <div className="earn mono">+{stay.pointsEarned.toLocaleString()} 分</div>
        ) : stay.pointsRedeemed ? (
          <div className="redeem mono">兑换 {stay.pointsRedeemed.toLocaleString()} 分</div>
        ) : null}
        {(onEdit || onDelete || onRepeat) && (
          <div className="actions">
            {/* 「再住一次」只对已住记录有意义——未来行程还没住，无需复制 */}
            {onRepeat && !upcoming && (
              <button onClick={() => onRepeat(stay)} aria-label={`以 ${stay.hotelName} 为模板新建记录`}>
                <IconCopy width={13} height={13} /> 再住一次
              </button>
            )}
            {onEdit && (
              <button onClick={() => onEdit(stay)} aria-label={`编辑 ${stay.hotelName}`}>
                <IconEdit width={13} height={13} /> 编辑
              </button>
            )}
            {onDelete && (
              <button className="del" onClick={() => onDelete(stay)} aria-label={`删除 ${stay.hotelName}`}>
                <IconTrash width={13} height={13} /> 删除
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
