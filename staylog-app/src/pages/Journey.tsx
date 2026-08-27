import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { useStaylog } from "../store/staylog";
import { computeAchievements } from "../lib/achievements";
import StayHeatmap from "../components/StayHeatmap";
import BadgeGrid from "../components/BadgeGrid";
import EmptyState from "../components/EmptyState";

/**
 * 「轨迹」页：把散在各处的时间维度信息收成一页——哪些日子在外面，攒下了哪些成就。
 * 与统计页的分工：统计页回答「多少」，轨迹页回答「什么时候」和「走到哪一步了」。
 */
export default function Journey() {
  const stays = useStaylog((s) => s.stays);
  const memberships = useStaylog((s) => s.memberships);
  const [year, setYear] = useState(() => dayjs().year());

  const achievements = useMemo(() => computeAchievements(stays, memberships), [stays, memberships]);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  if (stays.length === 0) {
    return (
      <main className="page">
        <div className="page-head"><h1 className="serif">轨迹</h1></div>
        <EmptyState />
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="serif">轨迹</h1>
          <div className="sub">
            已解锁 {unlockedCount} / {achievements.length} 枚徽章
          </div>
        </div>
      </div>

      <section className="journey-sec">
        <div className="sec-head">
          <h2 className="serif">住宿日历</h2>
          <span className="en">NIGHTS CALENDAR</span>
          <div className="rule" />
        </div>
        <StayHeatmap stays={stays} year={year} onYearChange={setYear} />
      </section>

      <section className="journey-sec">
        <div className="sec-head">
          <h2 className="serif">成就徽章</h2>
          <span className="en">ACHIEVEMENTS</span>
          <div className="rule" />
        </div>
        <BadgeGrid achievements={achievements} />
      </section>
    </main>
  );
}
