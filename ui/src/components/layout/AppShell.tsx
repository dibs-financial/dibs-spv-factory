import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNavCounts, useProfile } from "@/hooks/useFactory";
import { AppSidebar } from "./AppSidebar";
import { MobileTabBar } from "./MobileTabBar";
import { TopBar } from "./TopBar";

const COLLAPSE_KEY = "dibs.sidebar.collapsed";
/** Roles the migrations grant read access to (user_roles / has_role). */
const FACTORY_ROLES = ["admin", "operator", "compliance_reviewer", "counsel"];

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Sidebar on large screens, bottom tab bar below them; the page renders in the Outlet. */
export function AppShell() {
  const { live, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const profile = useProfile();
  const counts = useNavCounts();
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
  const roles = profile.data?.roles ?? [];
  const noRole = live && profile.isSuccess && !roles.some((r) => FACTORY_ROLES.includes(r));
  const roleLabel = roles.length ? roles.map((r) => r.replace(/_/g, " ")).join(", ") : "No factory role";

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
        masterEntity={profile.data?.masterEntity ?? null}
        operator={{
          name: profile.data?.name ?? "",
          initials: profile.data?.initials ?? "",
          role: roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1),
        }}
        counts={counts.data ?? {}}
        onSignOut={live ? () => void signOut() : undefined}
      />
      <div className="flex min-w-0 grow flex-col">
        <TopBar sampleData={!live} unread={counts.data?.alerts ?? 0} />
        <main id="main" className="grow px-5 pb-28 pt-8 lg:px-10 lg:pb-10">
          {noRole && (
            <p role="status" className="mx-auto mb-6 max-w-[1360px] rounded-md bg-warning-tint px-4 py-3 text-sm text-warning">
              Signed in as {profile.data?.email}, but this account has no factory role, so the tables below read as
              empty. An admin grants one with an insert into <code className="font-mono">public.user_roles</code>.
            </p>
          )}
          <Outlet />
        </main>
      </div>
      <MobileTabBar alerts={counts.data?.alerts ?? 0} />
    </div>
  );
}
