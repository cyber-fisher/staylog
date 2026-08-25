import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Membership, Stay } from "../types";
import { demoMemberships, demoStays } from "../lib/demoData";
import {
  enqueue,
  flush,
  reconcile,
  stayToRow,
  membershipToRow,
} from "../lib/sync";

/** 单个用户的全部数据 */
interface UserData {
  stays: Stay[];
  memberships: Membership[];
}

const EMPTY: UserData = { stays: [], memberships: [] };

function nowIso() {
  return new Date().toISOString();
}
function uuid() {
  return crypto.randomUUID();
}

interface StaylogState {
  byUser: Record<string, UserData>;
  activeUserId: string | null;
  // ---- 当前用户视图（派生字段）----
  stays: Stay[];
  memberships: Membership[];
  // ---- actions ----
  setActiveUser: (userId: string | null) => void;
  addStay: (stay: Stay) => void;
  updateStay: (id: string, patch: Partial<Stay>) => void;
  removeStay: (id: string) => void;
  upsertMembership: (m: Membership) => void;
  removeMembership: (id: string) => void;
  loadDemo: () => void;
  clearAll: () => void;
  importData: (stays: Stay[], memberships: Membership[]) => void;
  purgeUser: (userId: string) => void;
  /** 用云端数据覆盖当前用户视图（reconcile 后调用） */
  hydrateActive: (stays: Stay[], memberships: Membership[]) => void;
  /** 拉云端并与本地 LWW 合并；返回云端是否本来为空（供迁移判断） */
  reconcileActive: () => Promise<boolean>;
}

/** 对当前活动用户的数据做变更，同时同步 byUser 与视图字段 */
function applyToActive(s: StaylogState, fn: (d: UserData) => UserData): Partial<StaylogState> {
  if (!s.activeUserId) return {};
  const cur = s.byUser[s.activeUserId] || EMPTY;
  const next = fn(cur);
  return {
    byUser: { ...s.byUser, [s.activeUserId]: next },
    stays: next.stays,
    memberships: next.memberships,
  };
}

/** 入队一条 stay 的 upsert，并尽力 flush（不阻塞 UI） */
function queueStay(userId: string, stay: Stay) {
  enqueue({ table: "stays", op: "upsert", row: { ...stayToRow(stay, userId) } });
  void flush();
}
function queueStayDelete(userId: string, id: string) {
  enqueue({
    table: "stays",
    op: "delete",
    row: { id, user_id: userId, deleted_at: nowIso(), updated_at: nowIso() },
  });
  void flush();
}
function queueMembership(userId: string, m: Membership) {
  enqueue({ table: "memberships", op: "upsert", row: { ...membershipToRow(m, userId) } });
  void flush();
}
function queueMembershipDelete(userId: string, id: string) {
  enqueue({
    table: "memberships",
    op: "delete",
    row: { id, user_id: userId, deleted_at: nowIso(), updated_at: nowIso() },
  });
  void flush();
}

export const useStaylog = create<StaylogState>()(
  persist(
    (set, get) => ({
      byUser: {},
      activeUserId: null,
      stays: [],
      memberships: [],

      setActiveUser: (userId) =>
        set((s) => {
          const data = (userId && s.byUser[userId]) || EMPTY;
          return {
            activeUserId: userId,
            stays: data.stays,
            memberships: data.memberships,
          };
        }),

      addStay: (stay) => {
        const uid = get().activeUserId;
        const stamped: Stay = { ...stay, updatedAt: nowIso() };
        set((s) =>
          applyToActive(s, (d) => ({
            ...d,
            stays: [...d.stays, stamped].sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
          }))
        );
        if (uid) queueStay(uid, stamped);
      },

      updateStay: (id, patch) => {
        const uid = get().activeUserId;
        const merged = { ...patch, updatedAt: nowIso() };
        let updated: Stay | undefined;
        set((s) =>
          applyToActive(s, (d) => {
            const stays = d.stays
              .map((st) => (st.id === id ? ((updated = { ...st, ...merged }), updated) : st))
              .sort((a, b) => b.checkIn.localeCompare(a.checkIn));
            return { ...d, stays };
          })
        );
        if (uid && updated) queueStay(uid, updated);
      },

      removeStay: (id) => {
        const uid = get().activeUserId;
        set((s) => applyToActive(s, (d) => ({ ...d, stays: d.stays.filter((st) => st.id !== id) })));
        if (uid) queueStayDelete(uid, id);
      },

      upsertMembership: (m) => {
        const uid = get().activeUserId;
        // 保证有 id（云端主键）；旧数据可能无 id
        const withId: Membership = { ...m, id: m.id || uuid(), updatedAt: nowIso() };
        set((s) =>
          applyToActive(s, (d) => {
            const exists = d.memberships.some((x) => x.id === withId.id);
            return {
              ...d,
              memberships: exists
                ? d.memberships.map((x) => (x.id === withId.id ? withId : x))
                : [...d.memberships, withId],
            };
          })
        );
        if (uid) queueMembership(uid, withId);
      },

      removeMembership: (id) => {
        const uid = get().activeUserId;
        set((s) => applyToActive(s, (d) => ({ ...d, memberships: d.memberships.filter((x) => x.id !== id) })));
        if (uid) queueMembershipDelete(uid, id);
      },

      loadDemo: () => {
        const uid = get().activeUserId;
        // 重新生成 uuid：demo 的 d01 等不是合法 uuid，云端插入会失败
        const stays: Stay[] = demoStays.map((s) => ({ ...s, id: uuid(), updatedAt: nowIso() }));
        const memberships: Membership[] = demoMemberships.map((m) => ({ ...m, id: uuid(), updatedAt: nowIso() }));
        // 先软删云端现有数据，再上传新集
        const prev = get();
        set((s) => applyToActive(s, () => ({ stays, memberships })));
        if (uid) {
          prev.stays.forEach((st) => queueStayDelete(uid, st.id));
          prev.memberships.forEach((m) => queueMembershipDelete(uid, m.id));
          stays.forEach((st) => queueStay(uid, st));
          memberships.forEach((m) => queueMembership(uid, m));
        }
      },

      clearAll: () => {
        const uid = get().activeUserId;
        const prev = get();
        set((s) => applyToActive(s, () => ({ ...EMPTY })));
        if (uid) {
          prev.stays.forEach((st) => queueStayDelete(uid, st.id));
          prev.memberships.forEach((m) => queueMembershipDelete(uid, m.id));
        }
      },

      importData: (stays, memberships) => {
        const uid = get().activeUserId;
        // 补齐 id 与 updatedAt（导入的备份可能缺）
        const ns: Stay[] = stays.map((s) => ({ ...s, id: s.id || uuid(), updatedAt: nowIso() }));
        const nm: Membership[] = memberships.map((m) => ({ ...m, id: m.id || uuid(), updatedAt: nowIso() }));
        const prev = get();
        set((s) => applyToActive(s, (d) => ({ ...d, stays: ns, memberships: nm })));
        if (uid) {
          prev.stays.forEach((st) => queueStayDelete(uid, st.id));
          prev.memberships.forEach((m) => queueMembershipDelete(uid, m.id));
          ns.forEach((st) => queueStay(uid, st));
          nm.forEach((m) => queueMembership(uid, m));
        }
      },

      purgeUser: (userId) =>
        set((s) => {
          const next = { ...s.byUser };
          delete next[userId];
          const clearView = s.activeUserId === userId;
          return {
            byUser: next,
            ...(clearView ? { activeUserId: null, stays: [], memberships: [] } : {}),
          };
        }),

      hydrateActive: (stays, memberships) =>
        set((s) => applyToActive(s, () => ({ stays, memberships }))),

      reconcileActive: async () => {
        const { activeUserId, stays, memberships } = get();
        if (!activeUserId) return true;
        try {
          const res = await reconcile({ stays, memberships });
          get().hydrateActive(res.stays, res.memberships);
          return res.cloudWasEmpty;
        } catch (e) {
          console.warn("[staylog] reconcile 失败（离线？稍后重试）:", e);
          return false;
        }
      },
    }),
    {
      name: "staylog-data",
      version: 1,
      partialize: (s) => ({ byUser: s.byUser, activeUserId: s.activeUserId }),
      migrate: (persisted: unknown, version: number) => {
        // v0 → v1：给缺 id 的 membership 补 uuid
        if (version < 1 && persisted && typeof persisted === "object") {
          const p = persisted as { byUser?: Record<string, UserData>; activeUserId?: string | null };
          if (p.byUser) {
            for (const uid of Object.keys(p.byUser)) {
              const u = p.byUser[uid];
              if (u?.memberships) {
                u.memberships = u.memberships.map((m) => (m.id ? m : { ...m, id: uuid() }));
              }
            }
          }
        }
        return persisted as StaylogState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const data = (state.activeUserId && state.byUser[state.activeUserId]) || EMPTY;
        state.stays = data.stays;
        state.memberships = data.memberships;
      },
    }
  )
);

// 开发期调试挂载点：允许在浏览器控制台/自动化里直接调 store 与查看同步状态
if (import.meta.env.DEV) {
  (window as unknown as { __staylog?: unknown }).__staylog = useStaylog;
}
