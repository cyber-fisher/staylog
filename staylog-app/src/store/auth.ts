import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { fetchProfile } from "../lib/sync";

export type Role = "admin" | "user";

export interface Profile {
  id: string;
  username: string;
  role: Role;
}

type Status = "loading" | "authed" | "anon";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /** loading=会话恢复中；authed=已登录；anon=未登录 */
  status: Status;
  /** 挂载时调用一次：恢复会话 + 订阅登录态变化 */
  init: () => void;
  register: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

/** 把 Supabase 英文错误映射成中文提示 */
function zhAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "邮箱或密码错误";
  if (m.includes("user already registered") || m.includes("already been registered")) return "该邮箱已注册，请直接登录";
  if (m.includes("password should be at least")) return "密码至少 6 位";
  if (m.includes("unable to validate email") || m.includes("invalid email")) return "邮箱格式不正确";
  if (m.includes("email not confirmed")) return "邮箱未验证（请在 Supabase 关闭邮箱验证，或去邮箱确认）";
  if (m.includes("network") || m.includes("fetch")) return "网络错误，请检查网络后重试";
  return msg;
}

// 模块级 guard：防 React StrictMode 下 init 重复订阅
let subscribed = false;

export const useAuth = create<AuthState>()((set) => ({
  session: null,
  profile: null,
  status: "loading",

  init: () => {
    if (subscribed) return;
    subscribed = true;

    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (session) {
        const profile = await loadProfileInto(session);
        set({ session, profile, status: "authed" });
      } else {
        set({ session: null, profile: null, status: "anon" });
      }
    });

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const profile = await loadProfileInto(session);
        set({ session, profile, status: "authed" });
      } else {
        set({ session: null, profile: null, status: "anon" });
      }
    });
  },

  register: async (email, password) => {
    const username = email.trim().split("@")[0] || email.trim();
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username } },
    });
    if (error) return { ok: false, error: zhAuthError(error.message) };
    // 关闭邮箱验证后 signUp 直接带回 session，onAuthStateChange 会接管
    return { ok: true };
  },

  login: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: zhAuthError(error.message) };
    return { ok: true };
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null, status: "anon" });
  },
}));

/** 拉 profile 并回填到 auth state；返回 Profile。amapKey 的回填由 staylog store 监听会话变化处理。 */
async function loadProfileInto(session: Session): Promise<Profile | null> {
  try {
    const p = await fetchProfile(session.user.id);
    if (p) return { id: p.id, username: p.username || "用户", role: p.role };
  } catch (e) {
    console.warn("[auth] 拉取 profile 失败:", e);
  }
  // profile 尚未就绪（触发器延迟）时的兜底：用邮箱本地部分
  const fallbackName = session.user.email?.split("@")[0] || "用户";
  return { id: session.user.id, username: fallbackName, role: "user" };
}

/** 当前登录用户（兼容旧消费点的 {id, username, role} 形状），未登录为 null */
export function useCurrentUser(): Profile | null {
  return useAuth((s) => s.profile);
}
