import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";

// Themes the Clerk sign-in/sign-up card to match the app's console-panel
// system. rootBox + card mirror the same two-layer bezel construction used
// by every other panel in the app (see globals.css's .console-panel /
// .console-panel-inner). Colors reference CSS custom properties so the
// card follows light/dark mode automatically.
export const authAppearance: ComponentProps<typeof SignIn>["appearance"] = {
  variables: {
    colorPrimary: "var(--primary)",
    colorBackground: "var(--card)",
    colorForeground: "var(--foreground)",
    colorInput: "var(--background)",
    colorBorder: "var(--border)",
    borderRadius: "1rem",
    fontFamily: "var(--font-sans)",
  },
  elements: {
    rootBox: "console-panel w-full rounded-[1.75rem] p-1.5",
    card: "console-panel-inner w-full rounded-[1.25rem] border-0 shadow-none p-6 sm:p-8",
    headerTitle: "text-xl font-semibold tracking-tight",
    headerSubtitle: "text-sm text-muted-foreground",
    socialButtonsBlockButton: "h-10 rounded-xl border border-input bg-background/80",
    dividerLine: "bg-border",
    dividerText: "text-xs uppercase tracking-[0.1em] text-muted-foreground",
    formFieldLabel: "text-sm font-medium",
    formFieldInput: "h-10 rounded-xl border border-input bg-background/80",
    formButtonPrimary: "h-10 rounded-full bg-primary hover:bg-primary/90 text-sm font-medium shadow-none",
    footerActionLink: "text-primary hover:text-primary/90",
    identityPreviewEditButton: "text-primary",
  },
};
