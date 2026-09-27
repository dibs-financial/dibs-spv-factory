import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Overview from "@/pages/Overview";
import Placeholder from "@/pages/Placeholder";
import SignIn from "@/pages/SignIn";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

/** Live mode needs a signed-in user (RLS); demo mode (no Supabase configured) goes straight in. */
function AuthGate({ children }: { children: ReactNode }) {
  const { live, loading, session } = useAuth();
  if (!live) return <>{children}</>;
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status">
        <Loader2 className="size-6 animate-spin text-subtle" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }
  return session ? <>{children}</> : <SignIn />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <BrowserRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Overview />} />
                <Route path="*" element={<Placeholder />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}
