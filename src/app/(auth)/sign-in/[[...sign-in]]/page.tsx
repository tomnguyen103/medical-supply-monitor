import { SignIn } from "@clerk/nextjs";

import { authAppearance } from "@/components/auth-appearance";
import { AuthNotConfigured } from "@/components/auth-not-configured";
import { integrations } from "@/lib/env";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  if (integrations.clerkClient) {
    return <SignIn appearance={authAppearance} />;
  }
  return <AuthNotConfigured mode="sign-in" />;
}
