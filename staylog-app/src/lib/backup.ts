import type { BackupFile, Membership, Stay } from "../types";

export function exportBackup(stays: Stay[], memberships: Membership[]): void {
  const data: BackupFile = {
    app: "staylog",
    version: 1,
    exportedAt: new Date().toISOString(),
    stays,
    memberships,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `staylog-backup-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function parseBackup(file: File): Promise<{ stays: Stay[]; memberships: Membership[] }> {
  const text = await file.text();
  const data = JSON.parse(text) as BackupFile;
  if (data.app !== "staylog" || !Array.isArray(data.stays) || !Array.isArray(data.memberships)) {
    throw new Error("不是有效的宿迹备份文件");
  }
  return { stays: data.stays, memberships: data.memberships };
}
