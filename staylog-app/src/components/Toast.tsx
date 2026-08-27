import { useEffect, useRef, useState } from "react";

export type ToastKind = "ok" | "err";
export interface ToastMsg {
  id: number;
  text: string;
  kind: ToastKind;
}

let push: ((text: string, kind: ToastKind) => void) | null = null;

/** 全局轻提示：toast("已保存") / toast("失败", "err")，任意模块可调用 */
export function toast(text: string, kind: ToastKind = "ok") {
  push?.(text, kind);
}

/** 挂在 App 根部一次的容器 */
export default function ToastHost() {
  const [list, setList] = useState<ToastMsg[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    push = (text, kind) => {
      const id = ++seq.current;
      setList((l) => [...l, { id, text, kind }]);
      window.setTimeout(() => {
        setList((l) => l.filter((t) => t.id !== id));
      }, 2600);
    };
    return () => {
      push = null;
    };
  }, []);

  if (list.length === 0) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}