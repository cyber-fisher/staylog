import { useMemo } from "react";
import type { Achievement } from "../lib/achievements";
import { IconAward } from "./Icons";

interface Props {
  achievements: Achievement[];
}

function Badge({ a }: { a: Achievement }) {
  const pct =
    a.threshold && a.threshold > 0
      ? Math.min(100, Math.round(((a.progress ?? 0) / a.threshold) * 100))
      : 0;
  const remaining = a.threshold != null ? Math.max(0, a.threshold - (a.progress ?? 0)) : null;

  return (
    <div className={`badge ${a.unlocked ? "on" : "off"} bt-${a.tier}`}>
      <div className="bg-seal" aria-hidden="true">
        <IconAward width={18} height={18} />
      </div>
      <div className="bg-name serif">{a.name}</div>
      <div className="bg-en">{a.en}</div>
      <div className="bg-desc">{a.desc}</div>
      {a.unlocked ? (
        a.unlockedAt ? (
          <div className="bg-at mono">解锁于 {a.unlockedAt}</div>
        ) : (
          <div className="bg-at">已解锁</div>
        )
      ) : (
        <>
          {/* 布尔型徽章（如跨年夜）没有 threshold，画不出进度条，只提示待解锁 */}
          {a.threshold != null ? (
            <>
              <div className="bg-bar"><i style={{ width: `${pct}%` }} /></div>
              <div className="bg-at mono">
                {a.progress ?? 0} / {a.threshold}
                {remaining ? ` · 还差 ${remaining}` : ""}
              </div>
            </>
          ) : (
            <div className="bg-at">尚未解锁</div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 成就徽章网格。分「已解锁 / 进行中」两组，已解锁在前。
 * 进行中按完成度降序——快到手的排在最上面，比按定义顺序更有推动力。
 */
export default function BadgeGrid({ achievements }: Props) {
  const { unlocked, pending } = useMemo(() => {
    const on = achievements.filter((a) => a.unlocked);
    const off = achievements
      .filter((a) => !a.unlocked)
      .sort((a, b) => {
        const ra = a.threshold ? (a.progress ?? 0) / a.threshold : -1;
        const rb = b.threshold ? (b.progress ?? 0) / b.threshold : -1;
        return rb - ra;
      });
    return { unlocked: on, pending: off };
  }, [achievements]);

  return (
    <div className="badge-wrap">
      {unlocked.length > 0 && (
        <>
          <div className="bg-group">
            已解锁 <b className="mono">{unlocked.length}</b> / {achievements.length}
          </div>
          <div className="badge-grid">
            {unlocked.map((a) => <Badge key={a.id} a={a} />)}
          </div>
        </>
      )}
      {pending.length > 0 && (
        <>
          <div className="bg-group">进行中</div>
          <div className="badge-grid">
            {pending.map((a) => <Badge key={a.id} a={a} />)}
          </div>
        </>
      )}
    </div>
  );
}
