import dayjs from "dayjs";
import type { Stay } from "../types";
import { GROUP_META } from "../types";
import { nightsOf, upcomingOf } from "../lib/stats";
import { IconClock } from "./Icons";

interface Props {
  stays: Stay[];
}

/** 距入住天数（今天入住 = 0） */
function daysUntil(checkIn: string): number {
  return dayjs(checkIn).startOf("day").diff(dayjs().startOf("day"), "day");
}

function groupLabel(s: Stay): string {
  const meta = GROUP_META[s.group] ?? GROUP_META.other;
  return s.group === "other" ? s.customGroupName || "其他" : meta.short;
}

/**
 * 首页「即将入住」倒计时卡。取最近 3 趟已订未住的行程，
 * 主卡展示最近一趟，其余压缩成列表行。无未来行程时不渲染（不占位）。
 */
export default function UpcomingTrip({ stays }: Props) {
  const upcoming = upcomingOf(stays).slice(0, 3);
  if (upcoming.length === 0) return null;

  const [next, ...rest] = upcoming;
  const days = daysUntil(next.checkIn);
  const meta = GROUP_META[next.group] ?? GROUP_META.other;

  return (
    <section className="card upcoming" aria-label="即将入住">
      <div className="upcoming-main">
        <div className="uc-count">
          <span className="eyebrow">
            <IconClock width={12} height={12} /> 距入住
          </span>
          <div className="uc-days mono">
            {days}
            <small> 天</small>
          </div>
        </div>
        <div className="uc-body">
          <div className="uc-hotel">
            {next.hotelName}
            {next.hotelNameEn && <span className="en">{next.hotelNameEn}</span>}
          </div>
          <div className="uc-meta">
            <span className={`chip ${meta.className}`}>{groupLabel(next)}</span>
            {next.city && (
              <span>
                {next.city}
                {next.country ? ` · ${next.country}` : ""}
              </span>
            )}
            {next.roomType && <span>{next.roomType}</span>}
          </div>
          <div className="uc-dates mono">
            {dayjs(next.checkIn).format("M月D日")} — {dayjs(next.checkOut).format("M月D日")}
            <span className="sep">·</span>
            {nightsOf(next)} 晚
          </div>
        </div>
      </div>

      {rest.length > 0 && (
        <ul className="upcoming-rest">
          {rest.map((s) => (
            <li key={s.id}>
              <span className="d mono">{dayjs(s.checkIn).format("M/D")}</span>
              <span className="h">{s.hotelName}</span>
              <span className="c">{s.city}</span>
              <span className="n mono">{daysUntil(s.checkIn)} 天后</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
