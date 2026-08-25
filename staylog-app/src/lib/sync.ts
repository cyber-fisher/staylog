import { supabase } from "./supabase";
import type { StayRow, MembershipRow } from "./supabase";
import type { Membership, Stay } from "../types";

/**
 * 离线优先同步层。
 * - 写：先落本地（store 负责），再入 outbox，尽力 flush 到云端。
 * - 读：reconcile 先 flush 本地待同步（含删除墓碑），再 pull 云端，按 updatedAt 做
 *   最后写入优先（LWW）合并，丢弃带 deleted_at 的行。
 * - 冲突：同账号多设备，LWW 足够。
 */

const OUTBOX_KEY = "staylog-outbox";

type Table = "stays" | "memberships";
interface OutboxOp {
  table: Table;
  op: "upsert" | "delete";
  /** 已是可直接发往 Supabase 的行（snake_case，含 user_id / updated_at / deleted_at） */
  row: { id: string; user_id: string; [k: string]: unknown };
}

// ---- outbox（持久化到 localStorage，键 `${table}:${id}`，新操作覆盖旧的）----
function loadOutbox(): Record<string, OutboxOp> {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveOutbox(box: Record<string, OutboxOp>) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(box));
}
export function enqueue(op: OutboxOp) {
  const box = loadOutbox();
  box[`${op.table}:${op.row.id}`] = op;
  saveOutbox(box);
}
export function outboxSize(): number {
  return Object.keys(loadOutbox()).length;
}

// ---- 映射器（camelCase <-> snake_case；tags/certificates 走 JSONB 直通）----
export function stayToRow(s: Stay, userId: string): StayRow {
  return {
    id: s.id,
    user_id: userId,
    hotel_name: s.hotelName,
    hotel_name_en: s.hotelNameEn ?? null,
    brand: s.brand ?? null,
    group: s.group,
    custom_group_name: s.customGroupName ?? null,
    city: s.city ?? null,
    country: s.country ?? null,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    check_in: s.checkIn,
    check_out: s.checkOut,
    room_type: s.roomType ?? null,
    rate: s.rate ?? null,
    currency: s.currency ?? null,
    points_earned: s.pointsEarned ?? null,
    points_redeemed: s.pointsRedeemed ?? null,
    rating: s.rating ?? null,
    notes: s.notes ?? null,
    tags: s.tags ?? null,
    updated_at: s.updatedAt || new Date().toISOString(),
    deleted_at: null,
  };
}

export function rowToStay(r: StayRow): Stay {
  return {
    id: r.id,
    hotelName: r.hotel_name,
    hotelNameEn: r.hotel_name_en ?? undefined,
    brand: r.brand ?? "",
    group: r.group as Stay["group"],
    customGroupName: r.custom_group_name ?? undefined,
    city: r.city ?? "",
    country: r.country ?? "",
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    checkIn: r.check_in,
    checkOut: r.check_out,
    roomType: r.room_type ?? undefined,
    rate: r.rate ?? undefined,
    currency: r.currency ?? undefined,
    pointsEarned: r.points_earned ?? undefined,
    pointsRedeemed: r.points_redeemed ?? undefined,
    rating: r.rating ?? undefined,
    notes: r.notes ?? undefined,
    tags: r.tags ?? undefined,
    updatedAt: r.updated_at,
  };
}

export function membershipToRow(m: Membership, userId: string): MembershipRow {
  return {
    id: m.id,
    user_id: userId,
    group: m.group,
    custom_name: m.customName ?? null,
    custom_color: m.customColor ?? null,
    member_no: m.memberNo ?? null,
    tier: m.tier ?? null,
    points_balance: m.pointsBalance ?? 0,
    tier_expiry: m.tierExpiry ?? null,
    target_tier: m.targetTier ?? null,
    target_nights: m.targetNights ?? 0,
    bonus_nights: m.bonusNights ?? 0,
    certificates: m.certificates ?? [],
    updated_at: m.updatedAt || new Date().toISOString(),
    deleted_at: null,
  };
}

export function rowToMembership(r: MembershipRow): Membership {
  return {
    id: r.id,
    group: r.group as Membership["group"],
    customName: r.custom_name ?? undefined,
    customColor: r.custom_color ?? undefined,
    memberNo: r.member_no ?? undefined,
    tier: r.tier ?? "",
    pointsBalance: r.points_balance ?? 0,
    tierExpiry: r.tier_expiry ?? undefined,
    targetTier: r.target_tier ?? undefined,
    targetNights: r.target_nights ?? 0,
    bonusNights: r.bonus_nights ?? 0,
    certificates: r.certificates ?? [],
    updatedAt: r.updated_at,
  };
}

// ---- flush：把 outbox 逐条推到云端，成功即出队，网络错误保留重试 ----
let flushing = false;
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const box = loadOutbox();
    for (const [key, op] of Object.entries(box)) {
      let error;
      if (op.op === "delete") {
        // 软删除：只更新 deleted_at/updated_at 两列，避免 upsert 触发 NOT NULL 约束
        const res = await supabase
          .from(op.table)
          .update({ deleted_at: op.row.deleted_at, updated_at: op.row.updated_at })
          .eq("id", op.row.id);
        error = res.error;
      } else {
        const res = await supabase.from(op.table).upsert(op.row);
        error = res.error;
      }
      if (error) {
        // 网络/权限错误：保留该 op 等下次重试；其余继续尝试
        console.warn("[sync] flush 失败，保留重试:", op.table, op.row.id, error.message);
        continue;
      }
      delete box[key];
      saveOutbox(box);
    }
  } finally {
    flushing = false;
  }
}

// ---- pull：拉当前用户全部行（RLS 已限本人），保留 deleted_at 供合并 ----
async function pullStays(): Promise<StayRow[]> {
  const { data, error } = await supabase.from("stays").select("*");
  if (error) throw error;
  return (data as StayRow[]) || [];
}
async function pullMemberships(): Promise<MembershipRow[]> {
  const { data, error } = await supabase.from("memberships").select("*");
  if (error) throw error;
  return (data as MembershipRow[]) || [];
}

/** LWW 合并：按 id 分组，updatedAt 较新者胜；丢弃带 deleted_at 的墓碑。 */
function mergeStays(local: Stay[], cloud: StayRow[]): Stay[] {
  const map = new Map<string, { s: Stay; deleted: boolean }>();
  for (const s of local) map.set(s.id, { s, deleted: false });
  for (const r of cloud) {
    const cloudStay = rowToStay(r);
    const cloudDeleted = !!r.deleted_at;
    const cur = map.get(r.id);
    if (!cur) {
      map.set(r.id, { s: cloudStay, deleted: cloudDeleted });
    } else {
      const localTs = cur.s.updatedAt || "";
      const cloudTs = r.updated_at || "";
      if (cloudTs >= localTs) map.set(r.id, { s: cloudStay, deleted: cloudDeleted });
    }
  }
  return [...map.values()]
    .filter((x) => !x.deleted)
    .map((x) => x.s)
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn));
}

function mergeMemberships(local: Membership[], cloud: MembershipRow[]): Membership[] {
  const map = new Map<string, { m: Membership; deleted: boolean }>();
  for (const m of local) map.set(m.id, { m, deleted: false });
  for (const r of cloud) {
    const cloudM = rowToMembership(r);
    const cloudDeleted = !!r.deleted_at;
    const cur = map.get(r.id);
    if (!cur) {
      map.set(r.id, { m: cloudM, deleted: cloudDeleted });
    } else {
      const localTs = cur.m.updatedAt || "";
      const cloudTs = r.updated_at || "";
      if (cloudTs >= localTs) map.set(r.id, { m: cloudM, deleted: cloudDeleted });
    }
  }
  return [...map.values()].filter((x) => !x.deleted).map((x) => x.m);
}

export interface ReconcileResult {
  stays: Stay[];
  memberships: Membership[];
  /** 云端是否本来就为空（用于首次登录的本地数据迁移判断） */
  cloudWasEmpty: boolean;
}

/**
 * 对账：严格顺序 flush → pull → 合并。
 * 顺序不能乱——先 flush 把本地删除墓碑推上去，否则 pull 回来的旧行会"复活"已删除数据。
 */
export async function reconcile(local: {
  stays: Stay[];
  memberships: Membership[];
}): Promise<ReconcileResult> {
  await flush();
  const [cloudStays, cloudMemberships] = await Promise.all([pullStays(), pullMemberships()]);
  const cloudWasEmpty = cloudStays.length === 0 && cloudMemberships.length === 0;
  return {
    stays: mergeStays(local.stays, cloudStays),
    memberships: mergeMemberships(local.memberships, cloudMemberships),
    cloudWasEmpty,
  };
}

/** 拉取当前用户的 profile（含 role 与 amap_key）。 */
export async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, role, amap_key")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; username: string | null; role: "admin" | "user"; amap_key: string } | null;
}

/** 更新当前用户的高德 key（存 profiles）。 */
export async function pushAmapKey(userId: string, amapKey: string) {
  const { error } = await supabase
    .from("profiles")
    .update({ amap_key: amapKey, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) console.warn("[sync] 保存高德 key 失败:", error.message);
}
