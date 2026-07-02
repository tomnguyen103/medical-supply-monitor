import { SignUp } from "@clerk/nextjs";

import { authAppearance } from "@/components/auth-appearance";
import { AuthNotConfigured } from "@/components/auth-not-configured";
import { integrations } from "@/lib/env";

export const metadata = { title: "Request access" };

export default function SignUpPage() {
  if (integrations.clerkClient) {
    return <SignUp appearance={authAppearance} />;
  }
  return <AuthNotConfigured mode="sign-up" />;
}
