import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ClerkProvider } from "@clerk/nextjs";

import { env, integrations } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.app.url),
  title: {
    default: "Critical Medical Supply Resilience Monitor",
    template: "%s · Supply Resilience Monitor",
  },
  description:
    "Know which critical medical supplies are at risk, why, what changed, and what your team should review. Built for hospital supply chain and pharmacy procurement teams.",
  applicationName: "Critical Medical Supply Resilience Monitor",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const tree = (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="min-h-[100dvh] bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );

  // ClerkProvider only mounts when configured, so the app boots without keys.
  if (integrations.clerkClient) {
    return <ClerkProvider>{tree}</ClerkProvider>;
  }
  return tree;
}
