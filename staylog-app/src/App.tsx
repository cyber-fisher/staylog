import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Stays from "./pages/Stays";
import Programs from "./pages/Programs";
import Settings from "./pages/Settings";
import LoginGate from "./pages/LoginGate";
import ConfirmDialog from "./components/ConfirmDialog";
import ToastHost from "./components/Toast";
import { useAuth, useCurrentUser } from "./store/auth";
import { useStaylog } from "./store/staylog";
import {
  IconAward, IconBed, IconChart, IconDashboard, IconMap, IconMenu, IconMoon, IconRoute, IconSettings, IconSun, IconX,
} from "./components/Icons";

// 懒加载 + 预取：把 import 工厂抽出，既给 lazy 用，也能在鼠标悬停/空闲时提前拉取大 chunk，
// 消除首次点击「足迹地图 / 统计分析」时下载 maplibre(≈1MB)/recharts(≈400KB) 造成的卡顿。
const importMap = () => import("./pages/MapPage");
const importJourney = () => import("./pages/Journey");
const importStats = () => import("./pages/Stats");
const importWrapped = () => import("./pages/Wrapped");

const MapPage = lazy(importMap);
const Journey = lazy(importJourney);
const Stats = lazy(importStats);
const Wrapped = lazy(importWrapped);

// 已发起的预取只跑一次，避免悬停反复触发
const prefetched = new Set<string>();
function prefetch(key: string, factory: () => Promise<unknown>) {
  if (prefetched.has(key)) return;
  prefetched.add(key);
  void factory();
}

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
  const status = useAuth((s) => s.status);
  const init = useAuth((s) => s.init);
  const logout = useAuth((s) => s.logout);
  const setActiveUser = useStaylog((s) => s.setActiveUser);
  const reconcileActive = useStaylog((s) => s.reconcileActive);

  // 挂载时恢复会话 + 订阅登录态
  useEffect(() => {
    init();
  }, [init]);

  // 浏览器空闲时预取懒加载页面，首次点击不再等大 chunk 下载
  useEffect(() => {
    const ric =
      (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ||
      ((cb: () => void) => window.setTimeout(cb, 1200));
    const id = ric(() => {
      prefetch("map", importMap);
      prefetch("stats", importStats);
      prefetch("journey", importJourney);
    });
    return () => {
      const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (cic) cic(id as number);
      else clearTimeout(id as number);
    };
  }, []);

  const [migrateAsk, setMigrateAsk] = useState<{ stays: number; memberships: number } | null>(null);
  // 移动端「更多」面板开关（次要项：主题/数据管理/用户/退出）
  const [moreOpen, setMoreOpen] = useState(false);

  // 登录用户变化时：切到该用户的隔离空间，并拉云端对账
  useEffect(() => {
    const uid = currentUser?.id ?? null;
    setActiveUser(uid);
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const localBefore = useStaylog.getState();
      const localHasData = localBefore.stays.length > 0 || localBefore.memberships.length > 0;
      const cloudWasEmpty = await reconcileActive();
      if (cancelled) return;
      // Phase 7：首次登录且云端为空、本地有数据 → 询问是否上传旧数据
      const migratedFlag = `staylog-migrated:${uid}`;
      if (cloudWasEmpty && localHasData && !localStorage.getItem(migratedFlag)) {
        setMigrateAsk({ stays: localBefore.stays.length, memberships: localBefore.memberships.length });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, setActiveUser, reconcileActive]);

  // focus / 恢复联网时重新对账（替代 realtime）
  useEffect(() => {
    if (!currentUser?.id) return;
    const refetch = () => void reconcileActive();
    window.addEventListener("focus", refetch);
    window.addEventListener("online", refetch);
    return () => {
      window.removeEventListener("focus", refetch);
      window.removeEventListener("online", refetch);
    };
  }, [currentUser?.id, reconcileActive]);

  function confirmMigrate() {
    const s = useStaylog.getState();
    // 把当前本地数据重新走 importData 上传（会补 id、盖 updatedAt、软删云端旧数据后上传）
    s.importData(s.stays, s.memberships);
    if (currentUser?.id) localStorage.setItem(`staylog-migrated:${currentUser.id}`, "1");
    setMigrateAsk(null);
  }
  function dismissMigrate() {
    if (currentUser?.id) localStorage.setItem(`staylog-migrated:${currentUser.id}`, "1");
    setMigrateAsk(null);
  }

  const location = useLocation();
  const isWrapped = location.pathname.startsWith("/stats/wrapped");
  const isAdmin = currentUser?.role === "admin";

  // 切换路由时关闭移动端「更多」面板
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  // 会话恢复中 → 轻量占位，避免刷新时闪一下登录页
  if (status === "loading") {
    return (
      <div className="shell">
        <main className="page"><div style={{ color: "var(--faint)", padding: 40 }}>加载中…</div></main>
      </div>
    );
  }

  // 未登录 → 登录门禁
  if (status === "anon" || !currentUser) {
    return (
      <div className="shell">
        <LoginGate />
        <ToastHost />
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
          <div className="nav-primary">
            <NavLink to="/" end><span className="ico"><IconDashboard /></span>总览</NavLink>
            <NavLink to="/stays"><span className="ico"><IconBed /></span>住宿记录</NavLink>
            <NavLink to="/programs"><span className="ico"><IconAward /></span>常旅客计划</NavLink>
            <NavLink to="/journey" onMouseEnter={() => prefetch("journey", importJourney)}><span className="ico"><IconRoute /></span>轨迹</NavLink>
            <NavLink to="/map" onMouseEnter={() => prefetch("map", importMap)}><span className="ico"><IconMap /></span>足迹地图</NavLink>
            <NavLink to="/stats" onMouseEnter={() => prefetch("stats", importStats)}><span className="ico"><IconChart /></span>统计分析</NavLink>
            {/* 仅移动端底部栏显示的「更多」入口 */}
            <button type="button" className="nav-more-btn" onClick={() => setMoreOpen((v) => !v)} aria-label="更多">
              <span className="ico"><IconMenu /></span>更多
            </button>
          </div>
          <div className="spacer" />
          <div className={`nav-secondary ${moreOpen ? "open" : ""}`}>
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
          </div>
          {/* 移动端「更多」面板的背景遮罩 */}
          {moreOpen && <div className="nav-more-mask" onClick={() => setMoreOpen(false)} />}
        </nav>
      )}
      <Suspense fallback={<main className="page"><div style={{ color: "var(--faint)", padding: 40 }}>加载中…</div></main>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stays" element={<Stays />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/journey" element={<Journey />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/stats/wrapped/:year" element={<Wrapped />} />
          {/* 设置路由守卫：非管理员访问显示无权限 */}
          <Route path="/settings" element={isAdmin ? <Settings /> : <AccessDenied />} />
        </Routes>
      </Suspense>

      <ConfirmDialog
        open={!!migrateAsk}
        title="检测到本机旧数据"
        body={migrateAsk ? `本浏览器有 ${migrateAsk.stays} 条住宿记录、${migrateAsk.memberships} 个会籍尚未上云。是否上传到当前账号？（云端此账号目前为空）` : ""}
        confirmLabel="上传到云端"
        onConfirm={confirmMigrate}
        onCancel={dismissMigrate}
      />
      <ToastHost />
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
