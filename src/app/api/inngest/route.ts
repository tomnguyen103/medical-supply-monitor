import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

// Exposes Inngest functions to the Inngest platform / Dev Server.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
