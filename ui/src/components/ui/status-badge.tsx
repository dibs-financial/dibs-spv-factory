import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Status chip: text on a tint, 4.5:1 or better in every tone. Tones differ in
 * lightness as well as hue, so they still read in grayscale.
 *   success   gate passed, filed, received
 *   info      in progress, informational
 *   warning   held, manual step, due soon
 *   critical  blocked, overdue, escalation
 *   neutral   not started
 */
const statusBadgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-semibold leading-5",
  {
    variants: {
      tone: {
        success: "bg-success-tint text-success",
        info: "bg-info-tint text-info",
        warning: "bg-warning-tint text-warning",
        critical: "bg-critical-tint text-critical",
        neutral: "bg-neutral-status-tint text-neutral-status",
      },
      code: {
        true: "font-mono font-medium tracking-normal",
        false: "uppercase tracking-[0.08em]",
      },
    },
    defaultVariants: { tone: "neutral", code: false },
  },
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof statusBadgeVariants> {}

export function StatusBadge({ className, tone, code, ...props }: StatusBadgeProps) {
  return <span className={cn(statusBadgeVariants({ tone, code }), className)} {...props} />;
}
