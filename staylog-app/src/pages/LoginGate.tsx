import { useState } from "react";
import { useAuth } from "../store/auth";

export default function LoginGate() {
  const accounts = useAuth((s) => s.accounts);
  const register = useAuth((s) => s.register);
  const login = useAuth((s) => s.login);

  const firstRun = accounts.length === 0;
  const [mode, setMode] = useState<"login" | "register">(firstRun ? "register" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = mode === "register" ? await register(username, password) : await login(username, password);
    setBusy(false);
    if (!res.ok) setError(res.error || "操作失败");
    // 成功后 currentUserId 变化，App 会自动切到主界面
  }

  return (
    <div className="login-screen">
      <div className="login-card card">
        <div className="login-brand serif">
          <span className="zh">宿迹</span>
          <span className="en">STAYLOG</span>
        </div>

        {firstRun ? (
          <p className="login-lead">
            欢迎第一次使用。请创建管理员账号——首个账号即管理员，可管理高德 Key 与用户。
          </p>
        ) : (
          <div className="login-tabs">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>
              登录
            </button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>
              注册新用户
            </button>
          </div>
        )}

        <form onSubmit={submit} className="login-form">
          <div className="field">
            <label htmlFor="lg-user">用户名</label>
            <input id="lg-user" autoComplete="username" value={username}
              onChange={(e) => setUsername(e.target.value)} placeholder="输入用户名" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="lg-pass">密码</label>
            <input id="lg-pass" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入密码" />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ justifyContent: "center", width: "100%" }}>
            {busy ? "处理中…" : mode === "register" ? (firstRun ? "创建管理员并进入" : "注册并进入") : "登录"}
          </button>
        </form>

        <p className="login-note">
          每个用户的住宿记录、会籍、Key 相互独立。数据保存在本浏览器，清除浏览器数据会丢失。
        </p>
      </div>
    </div>
  );
}
