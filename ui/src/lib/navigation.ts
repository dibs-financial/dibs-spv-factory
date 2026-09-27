import {
  Banknote,
  FileText,
  LayoutGrid,
  type LucideIcon,
  PenLine,
  ReceiptText,
  ScrollText,
  ShieldAlert,
  Users,
  Workflow,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Count shown beside the item; `urgent` counts are red and survive the collapsed rail. */
  count?: number;
  urgent?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * The operator console's information architecture. Counts here are sample
 * values; wire them to the factory functions (alert_log, spv_pipeline,
 * billing_invoice_feed) when connecting real data.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { label: "Overview", to: "/", icon: LayoutGrid },
      { label: "Formation pipeline", to: "/pipeline", icon: Workflow, count: 18 },
      { label: "Series ledger", to: "/ledger", icon: ScrollText },
      { label: "EIN signatories", to: "/signatories", icon: PenLine },
    ],
  },
  {
    label: "Compliance",
    items: [
      { label: "Alerts", to: "/alerts", icon: ShieldAlert, count: 4, urgent: true },
      { label: "Filings", to: "/filings", icon: FileText },
      { label: "Investors & KYC", to: "/investors", icon: Users },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Capital calls", to: "/capital-calls", icon: Banknote },
      { label: "Billing", to: "/billing", icon: ReceiptText, count: 41 },
    ],
  },
];

export function findNav(pathname: string): { group: NavGroup; item: NavItem } | undefined {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)) return { group, item };
    }
  }
  return undefined;
}
