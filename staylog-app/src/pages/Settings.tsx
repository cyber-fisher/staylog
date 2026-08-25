import { useRef, useState } from "react";
import { useStaylog } from "../store/staylog";
import { exportBackup, parseBackup } from "../lib/backup";
import { AMAP_KEY } from "../lib/amap";
import ConfirmDialog from "../components/ConfirmDialog";
import { IconDownload, IconSparkle, IconTrash, IconUpload } from "../components/Icons";

export default function Settings() {
  const stays = useStaylog((s) => s.stays);
  const memberships = useStaylog((s) => s.memberships);
  const importData = useStaylog((s) => s.importData);
  const loadDemo = useStaylog((s) => s.loadDemo);
  const clearAll = useStaylog((s) => s.clearAll);

  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ stays: number; memberships: number; apply: () => void } | null>(null);

  async function onImportFile(file: File) {
    try {
      const data = await parseBackup(file);
      if (stays.length > 0 || memberships.length > 0) {
        setPendingImport({
          stays: data.stays.length,
          memberships: data.memberships.length,
          apply: () => { importData(data.stays, data.memberships); setMsg({ text: `已导入 ${data.stays.length} 条住宿记录`, ok: true }); },
        });
      } else {
        importData(data.stays, data.memberships);
        setMsg({ text: `已导入 ${data.stays.length} 条住宿记录、${data.memberships.length} 个会籍`, ok: true });
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "导入失败：文件格式不正确", ok: false });
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="serif">数据管理</h1>
          <div className="sub">当前 {stays.length} 条住宿记录 · {memberships.length} 个常旅客计划 · 已启用云端同步（本地缓存 + 云端备份）</div>
        </div>
      </div>

      {msg && (
        <div className="card" style={{ padding: "12px 18px", marginBottom: 16, fontSize: 13, color: msg.ok ? "var(--good)" : "var(--danger)" }}>
          {msg.text}
        </div>
      )}

      <div className="card settings-block">
        <h3>酒店自动匹配（高德地图）</h3>
        <p>
          高德搜索由部署方全局配置，所有用户共享，无需单独设置。录入住宿时输入酒店名可自动搜索并带出城市、地址、坐标——中文酒店最准。
          未配置时系统仍会从酒店名离线识别品牌与集团（如「全季」→ 华住会）。
        </p>
        <div className="row" style={{ alignItems: "center" }}>
          {AMAP_KEY ? (
            <span style={{ fontSize: 13, color: "var(--good)" }}>● 在线搜索已启用（全局配置）</span>
          ) : (
            <span style={{ fontSize: 13, color: "var(--faint)" }}>○ 未配置高德 Key，当前仅离线品牌识别</span>
          )}
        </div>
      </div>

      <div className="card settings-block">
        <h3>备份与恢复</h3>
        <p>数据已自动云端同步，可跨设备访问。导出 JSON 仍可用于离线备份或迁移到其他工具；换设备时登录同一账号即可恢复。</p>
        <div className="row">
          <button className="btn btn-primary" onClick={() => exportBackup(stays, memberships)}>
            <IconDownload width={14} height={14} /> 导出备份 JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <IconUpload width={14} height={14} /> 导入备份
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = "";
            }} />
        </div>
      </div>

      <div className="card settings-block">
        <h3>演示数据</h3>
        <p>载入一组示例住宿与会籍数据，快速体验各页面效果。会覆盖当前数据。</p>
        <div className="row">
          <button className="btn" onClick={() => (stays.length > 0 ? setConfirmDemo(true) : loadDemo())}>
            <IconSparkle width={14} height={14} /> 载入演示数据
          </button>
        </div>
      </div>

      <div className="card settings-block" style={{ borderColor: "var(--danger)" }}>
        <h3 style={{ color: "var(--danger)" }}>清空全部数据</h3>
        <p>删除所有住宿记录和会籍信息，无法撤销。清空前请先导出备份。</p>
        <div className="row">
          <button className="btn btn-danger" onClick={() => setConfirmClear(true)}>
            <IconTrash width={14} height={14} /> 清空全部数据
          </button>
        </div>
      </div>

      <ConfirmDialog open={confirmDemo}
        title="载入演示数据？"
        body={`当前的 ${stays.length} 条记录和 ${memberships.length} 个会籍将被演示数据覆盖。建议先导出备份。`}
        confirmLabel="覆盖并载入"
        onConfirm={() => { loadDemo(); setConfirmDemo(false); setMsg({ text: "已载入演示数据", ok: true }); }}
        onCancel={() => setConfirmDemo(false)} />

      <ConfirmDialog open={confirmClear}
        title="确认清空全部数据？"
        body={`将删除 ${stays.length} 条住宿记录和 ${memberships.length} 个会籍信息，此操作无法撤销。`}
        confirmLabel="清空"
        danger
        onConfirm={() => { clearAll(); setConfirmClear(false); setMsg({ text: "已清空全部数据", ok: true }); }}
        onCancel={() => setConfirmClear(false)} />

      <ConfirmDialog open={!!pendingImport}
        title="导入将覆盖现有数据"
        body={pendingImport ? `备份中含 ${pendingImport.stays} 条住宿记录、${pendingImport.memberships} 个会籍，将替换当前全部数据。` : ""}
        confirmLabel="覆盖导入"
        onConfirm={() => { pendingImport?.apply(); setPendingImport(null); }}
        onCancel={() => setPendingImport(null)} />
    </main>
  );
}
