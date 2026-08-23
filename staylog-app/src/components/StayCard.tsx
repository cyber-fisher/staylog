import dayjs from "dayjs";
import type { Stay } from "../types";
import { GROUP_META } from "../types";
import { nightsOf } from "../lib/stats";
import { IconEdit, IconTrash } from "./Icons";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

interface Props {
  stay: Stay;
  onEdit?: (stay: Stay) => void;
  onDelete?: (stay: Stay) => void;
}

export default function StayCard({ stay, onEdit, onDelete }: Props) {
  const ci = dayjs(stay.checkIn);
  const co = dayjs(stay.checkOut);
  const nights = nightsOf(stay);
  const meta = GROUP_META[stay.group];
  const groupLabel =
    stay.group === "other" ? stay.customGroupName || "其他" : meta.short;

  return (
    <div className="card stay-card">
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
          <span className={`chip ${meta.className}`}>{groupLabel}</span>
          <span>{stay.city} · {stay.country}</span>
          {stay.roomType && <span>{stay.roomType}</span>}
          {stay.rating != null && <span>★ {stay.rating}</span>}
          {stay.tags?.map((t) => <span key={t}>#{t}</span>)}
        </div>
      </div>
      <div className="right">
        <div className="nights mono">{nights}<small> 晚</small></div>
        {stay.pointsEarned ? (
          <div className="earn mono">+{stay.pointsEarned.toLocaleString()} 分</div>
        ) : stay.pointsRedeemed ? (
          <div className="redeem mono">兑换 {stay.pointsRedeemed.toLocaleString()} 分</div>
        ) : null}
        {(onEdit || onDelete) && (
          <div className="actions">
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
