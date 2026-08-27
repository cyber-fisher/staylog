import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import type { Stay } from "../types";
import { GROUP_META } from "../types";
import { parseBookingText, type ParsedBooking } from "../lib/parseBooking";
import { nightsOf } from "../lib/stats";
import { IconClipboard, IconX } from "./Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 把解析出的草稿交给调用方去打开 StayForm 做确认 */
  onApply: (draft: Stay) => void;
}

/** 期望能解析到的字段，用于展示「已识别 / 待补全」对照 */
const EXPECTED = ["酒店名称", "入住日期", "离店日期", "房型", "房价", "城市", "集团/品牌"];

/** matched 里带后缀的项（如「离店日期（按晚数推算）」）也算命中对应字段 */
function isMatched(matched: string[], field: string): boolean {
  return matched.some((m) => m.startsWith(field));
}

/**
 * 订单文本粘贴导入弹窗。
 *
 * 只负责「解析 + 预览」，不做校验也不保存——点「填入表单」后把草稿交给 StayForm，
 * 复用它已有的 POI 搜索、品牌识别、城市地理编码和必填校验。
 */
export default function ImportPasteDialog({ open, onClose, onApply }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParsedBooking | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    // 每次打开重置，避免上次的解析结果残留
    if (open) {
      setText("");
      setResult(null);
      setFailed(false);
    }
  }, [open]);

  function doParse() {
    const r = parseBookingText(text);
    setResult(r);
    setFailed(r === null);
  }

  const draft = result?.draft;

  return (
    <dialog className="confirm paste-dialog" ref={ref} onCancel={onClose}>
      <div className="pd-head">
        <h3>
          <IconClipboard width={15} height={15} /> 粘贴导入
        </h3>
        <button className="icon-btn" onClick={onClose} aria-label="关闭">
          <IconX />
        </button>
      </div>

      <p className="pd-tip">
        贴入携程 / 官网 / 邮件里的订单确认文本，自动提取酒店、日期、房价。解析后仍会打开表单让你确认。
      </p>

      <textarea
        className="pd-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"例如：\n酒店名称：上海禧玥酒店\n入住日期：2026-10-01\n离店日期：2026-10-04\n房型：高级大床房\n总价：¥2,340"}
        aria-label="订单文本"
      />

      {failed && (
        <div className="pd-failed">
          未能从这段文本里识别出有效信息。可以换一段更完整的确认文本，或直接手动新增记录。
        </div>
      )}

      {draft && result && (
        <div className="pd-preview">
          <div className="pd-fields">
            {EXPECTED.map((f) => (
              <span key={f} className={`pd-chip ${isMatched(result.matched, f) ? "ok" : "miss"}`}>
                {f}
                {isMatched(result.matched, f) ? " ✓" : " 待补全"}
              </span>
            ))}
          </div>
          <dl className="pd-vals">
            <div>
              <dt>酒店</dt>
              <dd>{draft.hotelName || <i>未识别</i>}</dd>
            </div>
            <div>
              <dt>日期</dt>
              <dd className="mono">
                {dayjs(draft.checkIn).format("YYYY-MM-DD")} → {dayjs(draft.checkOut).format("YYYY-MM-DD")}
                {` · ${nightsOf(draft)} 晚`}
              </dd>
            </div>
            {draft.brand && (
              <div>
                <dt>集团</dt>
                <dd>
                  {GROUP_META[draft.group]?.name} · {draft.brand}
                </dd>
              </div>
            )}
            {draft.roomType && (
              <div>
                <dt>房型</dt>
                <dd>{draft.roomType}</dd>
              </div>
            )}
            {draft.rate != null && (
              <div>
                <dt>房价</dt>
                <dd className="mono">
                  {draft.currency} {draft.rate.toLocaleString()} / 晚
                </dd>
              </div>
            )}
            {draft.city && (
              <div>
                <dt>城市</dt>
                <dd>{draft.city}</dd>
              </div>
            )}
            {draft.notes && (
              <div>
                <dt>备注</dt>
                <dd>{draft.notes}</dd>
              </div>
            )}
          </dl>
          {!draft.city && (
            <div className="pd-hint">城市留空，填入表单后可由高德自动补全坐标。</div>
          )}
        </div>
      )}

      <div className="row">
        <button className="btn" onClick={onClose}>
          取消
        </button>
        {draft ? (
          <button className="btn btn-primary" onClick={() => onApply(draft)}>
            填入表单
          </button>
        ) : (
          <button className="btn btn-primary" onClick={doParse} disabled={!text.trim()}>
            解析
          </button>
        )}
      </div>
    </dialog>
  );
}
