import { useLocation } from "react-router-dom";
import { findNav } from "@/lib/navigation";

/** Stand-in for sections not built yet, so every navigation item lands somewhere. */
export default function Placeholder() {
  const { pathname } = useLocation();
  const title = findNav(pathname)?.item.label ?? "Settings";
  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-2">
      <h1 className="font-display text-3xl font-medium">{title}</h1>
      <p className="text-sm text-muted-foreground">This section uses the same shell; its content is not built yet.</p>
    </div>
  );
}
