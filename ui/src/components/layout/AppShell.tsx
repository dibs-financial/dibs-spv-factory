import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { MobileTabBar } from "./MobileTabBar";
import { TopBar } from "./TopBar";

const COLLAPSE_KEY = "dibs.sidebar.collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Sidebar on large screens, bottom tab bar below them; the page renders in the Outlet. */
export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // storage unavailable: keep the in-memory state
      }
      return !c;
    });
  };
  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <AppSidebar
        collapsed={collapsed}
        onToggle={toggle}
        masterEntity={{ name: "[MASTER LLC NAME]", noticeVerified: true }}
        operator={{ name: "[OPERATOR NAME]", initials: "[IN]", role: "Admin" }}
      />
      <div className="flex min-w-0 grow flex-col">
        <TopBar sampleData unread={4} />
        <main id="main" className="grow px-5 pb-28 pt-8 lg:px-10 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
