import { SignIn } from "@clerk/nextjs";

import { AuthNotConfigured } from "@/components/auth-not-configured";
import { integrations } from "@/lib/env";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  if (integrations.clerkClient) {
    return <SignIn />;
  }
  return <AuthNotConfigured mode="sign-in" />;
}
