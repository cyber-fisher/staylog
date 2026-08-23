import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Stays from "./pages/Stays";
import Programs from "./pages/Programs";
import Settings from "./pages/Settings";
import LoginGate from "./pages/LoginGate";
import { useAuth, useCurrentUser } from "./store/auth";
import { useStaylog } from "./store/staylog";
import {
  IconAward, IconBed, IconChart, IconDashboard, IconMap, IconMoon, IconSettings, IconSun, IconX,
} from "./components/Icons";

const MapPage = lazy(() => import("./pages/MapPage"));
const Stats = lazy(() => import("./pages/Stats"));
const Wrapped = lazy(() => import("./pages/Wrapped"));

type Theme = "system" | "light" | "dark";

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("staylog-theme") as Theme) || "system"
  );
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("staylog-theme", theme);
  }, [theme]);

  const cycleTheme = () =>
    setTheme((t) => (t === "system" ? "dark" : t === "dark" ? "light" : "system"));

  const currentUser = useCurrentUser();
  const logout = useAuth((s) => s.logout);
  const setActiveUser = useStaylog((s) => s.setActiveUser);

  // 登录用户变化时，切换 staylog 数据到该用户的隔离空间
  useEffect(() => {
    setActiveUser(currentUser?.id ?? null);
  }, [currentUser?.id, setActiveUser]);

  const location = useLocation();
  const isWrapped = location.pathname.startsWith("/stats/wrapped");
  const isAdmin = currentUser?.role === "admin";

  // 未登录 → 登录门禁
  if (!currentUser) {
    return (
      <div className="shell">
        <LoginGate />
      </div>
    );
  }

  return (
    <div className="shell">
      {!isWrapped && (
        <nav className="sidenav" aria-label="主导航">
          <div className="logo serif">
            <span className="zh">宿迹</span>
            <span className="en">STAYLOG</span>
          </div>
          <NavLink to="/" end><span className="ico"><IconDashboard /></span>总览</NavLink>
          <NavLink to="/stays"><span className="ico"><IconBed /></span>住宿记录</NavLink>
          <NavLink to="/programs"><span className="ico"><IconAward /></span>常旅客计划</NavLink>
          <NavLink to="/map"><span className="ico"><IconMap /></span>足迹地图</NavLink>
          <NavLink to="/stats"><span className="ico"><IconChart /></span>统计分析</NavLink>
          <div className="spacer" />
          <button className="theme-toggle" onClick={cycleTheme}>
            {theme === "dark" ? <IconMoon /> : theme === "light" ? <IconSun /> : <IconMoon opacity={0.5} />}
            主题：{theme === "system" ? "跟随系统" : theme === "dark" ? "深色" : "浅色"}
          </button>
          {/* 数据管理（含高德 Key）仅管理员可见 */}
          {isAdmin && (
            <NavLink to="/settings"><span className="ico"><IconSettings /></span>数据管理</NavLink>
          )}
          <div className="user-chip">
            <div className="avatar">{currentUser.username.slice(0, 1).toUpperCase()}</div>
            <div className="info">
              <div className="name">{currentUser.username}</div>
              <div className={`role ${isAdmin ? "admin" : ""}`}>{isAdmin ? "管理员" : "用户"}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>
            <span className="ico"><IconX /></span>退出登录
          </button>
        </nav>
      )}
      <Suspense fallback={<main className="page"><div style={{ color: "var(--faint)", padding: 40 }}>加载中…</div></main>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stays" element={<Stays />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/stats/wrapped/:year" element={<Wrapped />} />
          {/* 设置路由守卫：非管理员访问显示无权限 */}
          <Route path="/settings" element={isAdmin ? <Settings /> : <AccessDenied />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function AccessDenied() {
  return (
    <main className="page">
      <div className="card access-denied">
        <div className="art"><IconSettings width={34} height={34} /></div>
        <h2 className="serif">仅管理员可访问</h2>
        <p>数据管理与高德 Key 设置仅对管理员开放。你的住宿记录、会籍与地图不受影响，可正常使用。</p>
        <NavLink to="/" className="btn btn-primary" style={{ textDecoration: "none" }}>返回总览</NavLink>
      </div>
    </main>
  );
}
