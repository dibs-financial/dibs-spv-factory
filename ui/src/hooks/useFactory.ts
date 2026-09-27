import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchNavCounts,
  fetchOverview,
  type NavCounts,
  type OverviewData,
  SAMPLE_NAV_COUNTS,
  sampleOverview,
  verifyRecentChains,
} from "@/lib/overview-data";

/** How often live figures refresh; the scheduled runners move faster than this rarely. */
const REFRESH_MS = 60_000;

/** The overview's data: live under the signed-in user's RLS, or sample data in demo mode. */
export function useOverview() {
  const { live, session } = useAuth();
  return useQuery<OverviewData>({
    queryKey: ["overview", session?.user.id ?? "demo"],
    queryFn: () => (live && supabase ? fetchOverview(supabase) : Promise.resolve(sampleOverview())),
    enabled: !live || !!session,
    refetchInterval: live ? REFRESH_MS : false,
  });
}

export function useNavCounts() {
  const { live, session } = useAuth();
  return useQuery<NavCounts>({
    queryKey: ["nav-counts", session?.user.id ?? "demo"],
    queryFn: () => (live && supabase ? fetchNavCounts(supabase) : Promise.resolve(SAMPLE_NAV_COUNTS)),
    enabled: !live || !!session,
    refetchInterval: live ? REFRESH_MS : false,
  });
}

export interface Profile {
  email: string;
  name: string;
  initials: string;
  roles: string[];
  masterEntity: { name: string; noticeVerified: boolean } | null;
}

const DEMO_PROFILE: Profile = {
  email: "",
  name: "[OPERATOR NAME]",
  initials: "[IN]",
  roles: ["admin"],
  masterEntity: { name: "[MASTER LLC NAME]", noticeVerified: true },
};

/** The signed-in operator, their factory roles (user_roles) and the ACTIVE master entity. */
export function useProfile() {
  const { live, session } = useAuth();
  return useQuery<Profile>({
    queryKey: ["profile", session?.user.id ?? "demo"],
    enabled: !live || !!session,
    queryFn: async () => {
      if (!live || !supabase || !session) return DEMO_PROFILE;
      const [roles, master] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", session.user.id),
        supabase.from("master_entities").select("legal_name,has_liability_notice").eq("status", "ACTIVE").maybeSingle(),
      ]);
      if (roles.error) throw new Error(roles.error.message);
      const email = session.user.email ?? "";
      const name = (session.user.user_metadata?.full_name as string | undefined) ?? email;
      const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
      return {
        email,
        name,
        initials: initials || "?",
        roles: (roles.data ?? []).map((r) => r.role as string),
        // Non-admins cannot read master_entities (RLS): no card rather than a false alarm.
        masterEntity: master.data
          ? { name: master.data.legal_name as string, noticeVerified: master.data.has_liability_notice === true }
          : null,
      };
    },
  });
}

export function useVerifyChains() {
  return useMutation({
    mutationFn: () => {
      if (!supabase) throw new Error("Supabase is not configured.");
      return verifyRecentChains(supabase);
    },
  });
}
