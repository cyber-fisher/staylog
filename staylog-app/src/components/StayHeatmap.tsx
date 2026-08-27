import { useMemo } from "react";
import dayjs from "dayjs";
import type { Stay } from "../types";
import { dailyOccupancy, longestGap, longestStreak, yearsWithData } from "../lib/stats";

interface Props {
  stays: Stay[];
  year: number;
  onYearChange: (y: number) => void;
}

/** 强度分档：0 无 / 1 晚 / 2 晚 / 3 晚+（跨日重叠时同一天可能 >1 条记录） */
function level(nights: number): 0 | 1 | 2 | 3 {
  if (nights <= 0) return 0;
  if (nights === 1) return 1;
  if (nights === 2) return 2;
  return 3;
}

const WEEK_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * 全年住宿热力日历。
 *
 * 布局用 CSS Grid + `grid-auto-flow: column`：7 行（周日→周六）× 53 列（周），
 * 单元格按日期顺序铺进去，浏览器自己按列填充，不需要手算二维数组坐标。
 * 年初要补齐 1/1 之前的空格，否则第一列会从周日强行开始、整年错位。
 */
export default function StayHeatmap({ stays, year, onYearChange }: Props) {
  const years = useMemo(() => {
    const ys = yearsWithData(stays);
    const now = dayjs().year();
    return ys.includes(now) ? ys : [now, ...ys];
  }, [stays]);

  const occ = useMemo(() => dailyOccupancy(stays, year), [stays, year]);

  const { cells, lead, totalNights, streak, gap } = useMemo(() => {
    const start = dayjs(`${year}-01-01`);
    const end = dayjs(`${year}-12-31`);
    const days: { date: string; nights: number; label: string; month: number }[] = [];
    for (let d = start; !d.isAfter(end, "day"); d = d.add(1, "day")) {
      const key = d.format("YYYY-MM-DD");
      const cell = occ.get(key);
      const names = cell ? [...new Set(cell.stays.map((s) => s.hotelName))].join("、") : "";
      days.push({
        date: key,
        nights: cell?.nights ?? 0,
        label: names ? `${key} · ${names}` : `${key} · 未入住`,
        month: d.month(),
      });
    }
    const occupied = [...occ.keys()];
    return {
      cells: days,
      lead: start.day(), // 1/1 之前要补几个空格
      totalNights: [...occ.values()].reduce((n, c) => n + c.nights, 0),
      streak: longestStreak(occupied),
      gap: longestGap(occupied),
    };
  }, [occ, year]);

  // 月份标签：每月第 1 天所在的列（含年初补位），用 grid-column 定位
  const monthMarks = useMemo(
    () =>
      cells
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => dayjs(c.date).date() === 1)
        .map(({ c, i }) => ({ month: c.month, col: Math.floor((i + lead) / 7) + 1 })),
    [cells, lead]
  );

  return (
    <div className="card heatmap-card">
      <div className="hm-head">
        <div className="t">住宿热力日历</div>
        <select value={year} onChange={(e) => onYearChange(Number(e.target.value))} aria-label="选择年份">
          {years.map((y) => (
            <option key={y} value={y}>{y} 年</option>
          ))}
        </select>
      </div>

      {/* 窄屏横向滚动，不撑破页面 */}
      <div className="hm-scroll">
        <div className="hm-inner">
          <div className="hm-months" aria-hidden="true">
            {monthMarks.map((m) => (
              <span key={m.month} style={{ gridColumn: m.col }}>{m.month + 1}月</span>
            ))}
          </div>

          <div className="hm-body">
            <div className="hm-weeks" aria-hidden="true">
              {WEEK_LABELS.map((w, i) => (
                // 只标一三五，全标太挤
                <span key={w}>{i % 2 === 1 ? w : ""}</span>
              ))}
            </div>

            <div className="hm-grid" role="img" aria-label={`${year} 年住宿热力图，全年 ${totalNights} 晚`}>
              {Array.from({ length: lead }, (_, i) => (
                <i key={`lead-${i}`} className="hm-cell empty" aria-hidden="true" />
              ))}
              {cells.map((c) => (
                <i key={c.date} className={`hm-cell lv${level(c.nights)}`} title={c.label} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="hm-foot">
        <div className="hm-sum">
          全年 <b className="mono">{totalNights}</b> 晚 · 最长连住 <b className="mono">{streak}</b> 晚 · 最长空档{" "}
          <b className="mono">{gap}</b> 天
        </div>
        <div className="hm-legend" aria-hidden="true">
          <span>少</span>
          <i className="hm-cell lv0" />
          <i className="hm-cell lv1" />
          <i className="hm-cell lv2" />
          <i className="hm-cell lv3" />
          <span>多</span>
        </div>
      </div>

      {/* 与首页 KPI 的口径差异要讲清楚，否则用户会以为哪边算错了 */}
      <div className="hm-note">
        按实际住宿日历计：跨年的住宿会拆到两个年份，因此格子总数可能与总览页「住宿晚数」相差几晚（后者按入住日年份整段归属）。
      </div>
    </div>
  );
}
