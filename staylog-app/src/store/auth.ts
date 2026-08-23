import { create } from "zustand";
import { persist } from "zustand/middleware";
import { sha256 } from "../lib/hash";

export type Role = "admin" | "user";

export interface Account {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
}

interface AuthState {
  accounts: Account[];
  /** 当前登录用户 id，未登录为 null */
  currentUserId: string | null;
  register: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  /** 管理员删除某账号（同时清其数据由调用方处理） */
  removeAccount: (id: string) => void;
}

// 加盐：用户名参与哈希，避免相同密码得到相同散列
function saltedInput(username: string, password: string): string {
  return `staylog:${username.toLowerCase()}:${password}`;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      accounts: [],
      currentUserId: null,

      register: async (username, password) => {
        const name = username.trim();
        if (name.length < 2) return { ok: false, error: "用户名至少 2 个字符" };
        if (password.length < 4) return { ok: false, error: "密码至少 4 位" };
        const accounts = get().accounts;
        if (accounts.some((a) => a.username.toLowerCase() === name.toLowerCase())) {
          return { ok: false, error: "该用户名已被注册" };
        }
        const passwordHash = await sha256(saltedInput(name, password));
        const account: Account = {
          id: crypto.randomUUID(),
          username: name,
          passwordHash,
          // 第一个注册的用户自动成为管理员
          role: accounts.length === 0 ? "admin" : "user",
          createdAt: new Date().toISOString(),
        };
        set({ accounts: [...accounts, account], currentUserId: account.id });
        return { ok: true };
      },

      login: async (username, password) => {
        const name = username.trim();
        const account = get().accounts.find(
          (a) => a.username.toLowerCase() === name.toLowerCase()
        );
        if (!account) return { ok: false, error: "用户名不存在" };
        const hash = await sha256(saltedInput(name, password));
        if (hash !== account.passwordHash) return { ok: false, error: "密码错误" };
        set({ currentUserId: account.id });
        return { ok: true };
      },

      logout: () => set({ currentUserId: null }),

      removeAccount: (id) =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          currentUserId: s.currentUserId === id ? null : s.currentUserId,
        })),
    }),
    { name: "staylog-auth" }
  )
);

/** 便捷选择器 */
export function useCurrentUser(): Account | null {
  return useAuth((s) => s.accounts.find((a) => a.id === s.currentUserId) || null);
}
