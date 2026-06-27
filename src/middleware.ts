import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

// Clerk only activates when both keys are present, so the app boots without it.
const clerkConfigured =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

const handler = clerkConfigured
  ? clerkMiddleware(async (auth, req) => {
      if (isProtectedRoute(req)) {
        await auth.protect();
      }
    })
  : null;

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (handler) {
    return handler(req, event);
  }
  // Clerk not configured: let everything through (routes self-degrade).
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static assets,
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|otf|map)).*)",
    // and always on API routes.
    "/(api|trpc)(.*)",
  ],
};
