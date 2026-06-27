/**
 * LangGraph supervisor — STUB / architecture placeholder (Phase 6).
 *
 * Encodes the intended pipeline from the project plan as a typed plan. The real
 * StateGraph is built in Phase 6. It is defined here so the boundaries are
 * explicit from day one:
 *
 *   supervisor
 *     ├─ fda_shortage_agent      (summarize/classify)
 *     ├─ recall_agent            (summarize/classify)
 *     ├─ supplier_exposure_agent (summarize/classify)
 *     ├─ inventory_agent         (summarize/classify)
 *     ├─ external_risk_agent     (summarize/classify)
 *     ├─ deterministic_scorer    (CODE, not an LLM — see lib/risk/scoring.ts)
 *     ├─ briefing_agent          (draft the daily brief)
 *     ├─ critic_compliance_guard (block PHI / treatment / substitution advice)
 *     └─ human_approval_gate     (required for critical alerts)
 *
 * GUARDRAIL: agents only summarize, classify, and draft. The deterministic
 * scorer (code) owns the math; persistence and critical-alert delivery happen
 * outside the graph. Agents never own tenant access, scoring, final writes, or
 * alert delivery.
 */

import { integrations } from "@/lib/env";
import { SCORING_VERSION } from "@/lib/risk/scoring";

export type GraphNode =
  | "supervisor"
  | "fda_shortage_agent"
  | "recall_agent"
  | "supplier_exposure_agent"
  | "inventory_agent"
  | "external_risk_agent"
  | "deterministic_scorer"
  | "briefing_agent"
  | "critic_compliance_guard"
  | "human_approval_gate";

/** Nodes implemented by code (never by an LLM). */
export const DETERMINISTIC_NODES: ReadonlySet<GraphNode> = new Set([
  "deterministic_scorer",
  "human_approval_gate",
]);

export const DAILY_BRIEF_GRAPH: { nodes: GraphNode[]; scoringVersion: string } = {
  nodes: [
    "supervisor",
    "fda_shortage_agent",
    "recall_agent",
    "supplier_exposure_agent",
    "inventory_agent",
    "external_risk_agent",
    "deterministic_scorer",
    "briefing_agent",
    "critic_compliance_guard",
    "human_approval_gate",
  ],
  scoringVersion: SCORING_VERSION,
};

export interface DailyBriefResult {
  status: "ok" | "ai_not_configured";
  draft: string | null;
  requiresHumanApproval: boolean;
}

/**
 * Placeholder entrypoint. Returns a non-AI result until Phase 6 compiles the
 * real StateGraph. Drafting is the only AI responsibility; scoring/delivery are
 * handled deterministically elsewhere.
 */
export async function runDailyBriefWorkflow(): Promise<DailyBriefResult> {
  if (!integrations.ai) {
    return { status: "ai_not_configured", draft: null, requiresHumanApproval: false };
  }
  // TODO(Phase 6): compile StateGraph, run agents, trace in LangSmith.
  return { status: "ok", draft: null, requiresHumanApproval: true };
}
