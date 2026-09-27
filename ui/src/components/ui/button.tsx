import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Buttons. Same API as shadcn/ui's Button (variant names included), so code
 * Lovable generates keeps working; the look is the DIBS system.
 *
 *   default      Primary: the one action a view exists for. One per view.
 *   secondary    Supporting action beside a primary (outline is an alias).
 *   ghost        Quiet: low-emphasis actions in dense tables ("quiet" alias).
 *   destructive  Wind down, void, revoke. Always behind a confirmation.
 *   ink          Actions on dark panels and the sidebar.
 *   link         Inline text action.
 *
 * Labels are verbs that say what happens ("File Form D", not "Submit").
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans font-semibold transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "disabled:pointer-events-none aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed disabled:bg-primary-tint disabled:text-subtle",
        secondary:
          "border border-input bg-card font-normal text-foreground hover:border-[hsl(40_12%_68%)] hover:bg-topbar active:bg-muted disabled:text-subtle",
        outline:
          "border border-input bg-card font-normal text-foreground hover:border-[hsl(40_12%_68%)] hover:bg-topbar active:bg-muted disabled:text-subtle",
        ghost: "text-primary hover:bg-primary-tint hover:text-primary-hover active:bg-[hsl(171_30%_85%)] disabled:text-subtle",
        quiet: "text-primary hover:bg-primary-tint hover:text-primary-hover active:bg-[hsl(171_30%_85%)] disabled:text-subtle",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-[hsl(4_76%_34%)] active:bg-[hsl(4_78%_27%)] focus-visible:ring-destructive disabled:bg-critical-tint disabled:text-subtle",
        ink:
          "border border-sidebar-border bg-sidebar-hover font-normal text-sidebar-primary hover:bg-sidebar-accent active:bg-sidebar-border focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar disabled:text-sidebar-muted",
        link: "h-auto px-0 font-medium text-primary underline-offset-4 hover:text-primary-hover hover:underline",
      },
      size: {
        sm: "h-8 rounded-sm px-3 text-[13px]",
        default: "h-10 px-4 text-sm",
        lg: "h-12 rounded-lg px-5 text-[15px]",
        icon: "h-11 w-11 [&_svg]:size-[18px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner, sets aria-busy and blocks clicks; pass loadingText to say what is happening. */
  loading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, loadingText, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    if (asChild) {
      return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>{children}</Comp>;
    }
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            {loadingText ?? children}
          </>
        ) : children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
