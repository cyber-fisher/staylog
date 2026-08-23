import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Membership, Stay } from "../types";
import { demoMemberships, demoStays } from "../lib/demoData";

/** 单个用户的全部数据 */
interface UserData {
  stays: Stay[];
  memberships: Membership[];
  /** 高德 Web 服务 key（每个用户独立） */
  amapKey: string;
}

const EMPTY: UserData = { stays: [], memberships: [], amapKey: "" };

interface StaylogState {
  /** 按用户 id 隔离的数据（持久化） */
  byUser: Record<string, UserData>;
  /** 当前活动用户 id，由 auth 驱动 */
  activeUserId: string | null;
  // ---- 当前用户视图（派生字段，页面直接读取，与 byUser[activeUserId] 保持同步）----
  stays: Stay[];
  memberships: Membership[];
  amapKey: string;
  // ---- actions ----
  setActiveUser: (userId: string | null) => void;
  addStay: (stay: Stay) => void;
  updateStay: (id: string, patch: Partial<Stay>) => void;
  removeStay: (id: string) => void;
  upsertMembership: (m: Membership) => void;
  removeMembership: (group: string, customName?: string) => void;
  setAmapKey: (key: string) => void;
  loadDemo: () => void;
  clearAll: () => void;
  importData: (stays: Stay[], memberships: Membership[]) => void;
  /** 删除某用户的全部数据（管理员删账号时用） */
  purgeUser: (userId: string) => void;
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
    amapKey: next.amapKey,
  };
}

export const useStaylog = create<StaylogState>()(
  persist(
    (set) => ({
      byUser: {},
      activeUserId: null,
      stays: [],
      memberships: [],
      amapKey: "",

      setActiveUser: (userId) =>
        set((s) => {
          const data = (userId && s.byUser[userId]) || EMPTY;
          return {
            activeUserId: userId,
            stays: data.stays,
            memberships: data.memberships,
            amapKey: data.amapKey,
          };
        }),

      addStay: (stay) =>
        set((s) =>
          applyToActive(s, (d) => ({
            ...d,
            stays: [...d.stays, stay].sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
          }))
        ),

      updateStay: (id, patch) =>
        set((s) =>
          applyToActive(s, (d) => ({
            ...d,
            stays: d.stays
              .map((st) => (st.id === id ? { ...st, ...patch } : st))
              .sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
          }))
        ),

      removeStay: (id) =>
        set((s) => applyToActive(s, (d) => ({ ...d, stays: d.stays.filter((st) => st.id !== id) }))),

      upsertMembership: (m) =>
        set((s) =>
          applyToActive(s, (d) => {
            const key = (x: Membership) => `${x.group}:${x.customName || ""}`;
            const exists = d.memberships.some((x) => key(x) === key(m));
            return {
              ...d,
              memberships: exists
                ? d.memberships.map((x) => (key(x) === key(m) ? m : x))
                : [...d.memberships, m],
            };
          })
        ),

      removeMembership: (group, customName) =>
        set((s) =>
          applyToActive(s, (d) => ({
            ...d,
            memberships: d.memberships.filter(
              (x) => !(x.group === group && (x.customName || "") === (customName || ""))
            ),
          }))
        ),

      setAmapKey: (key) => set((s) => applyToActive(s, (d) => ({ ...d, amapKey: key.trim() }))),

      loadDemo: () =>
        set((s) =>
          applyToActive(s, () => ({
            stays: [...demoStays],
            memberships: [...demoMemberships],
            amapKey: s.amapKey,
          }))
        ),

      clearAll: () =>
        set((s) => applyToActive(s, (d) => ({ ...EMPTY, amapKey: d.amapKey }))),

      importData: (stays, memberships) =>
        set((s) => applyToActive(s, (d) => ({ ...d, stays, memberships }))),

      purgeUser: (userId) =>
        set((s) => {
          const next = { ...s.byUser };
          delete next[userId];
          const clearView = s.activeUserId === userId;
          return {
            byUser: next,
            ...(clearView ? { activeUserId: null, stays: [], memberships: [], amapKey: "" } : {}),
          };
        }),
    }),
    {
      name: "staylog-data",
      // 只持久化 byUser 与 activeUserId；视图字段在 rehydrate 后重新派生
      partialize: (s) => ({ byUser: s.byUser, activeUserId: s.activeUserId }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const data = (state.activeUserId && state.byUser[state.activeUserId]) || EMPTY;
        state.stays = data.stays;
        state.memberships = data.memberships;
        state.amapKey = data.amapKey;
      },
    }
  )
);
