import { useState } from "react";
import { useAuth } from "../store/auth";

export default function LoginGate() {
  const register = useAuth((s) => s.register);
  const login = useAuth((s) => s.login);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = mode === "register" ? await register(email, password) : await login(email, password);
    setBusy(false);
    if (!res.ok) setError(res.error || "操作失败");
    // 成功后会话变化，App 会自动切到主界面
  }

  return (
    <div className="login-screen">
      <div className="login-card card">
        <div className="login-brand serif">
          <span className="zh">宿迹</span>
          <span className="en">STAYLOG</span>
        </div>

        <div className="login-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>
            登录
          </button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>
            注册新用户
          </button>
        </div>

        <form onSubmit={submit} className="login-form">
          <div className="field">
            <label htmlFor="lg-email">邮箱</label>
            <input id="lg-email" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="lg-pass">密码</label>
            <input id="lg-pass" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "register" ? "至少 6 位" : "输入密码"} />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ justifyContent: "center", width: "100%" }}>
            {busy ? "处理中…" : mode === "register" ? "注册并进入" : "登录"}
          </button>
        </form>

        <p className="login-note">
          数据云端同步，可跨设备访问；离线时先存本地，联网后自动同步。首个注册的账号为管理员。
        </p>
      </div>
    </div>
  );
}
