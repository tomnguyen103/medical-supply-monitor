import { createHash, randomUUID } from "node:crypto";

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { and, desc, eq, sql } from "drizzle-orm";
import { Client as LangSmithClient } from "langsmith";

import { configureLangSmith, isLangSmithEnabled } from "@/lib/ai/langsmith";
import {
  assessCompliance,
  redactSensitiveText,
  sanitizeTracePayload,
  type ComplianceReport,
} from "@/lib/ai/safety";
import type {
  RiskDomain,
  Severity,
  StalenessStatus,
} from "@/lib/connectors/types";
import { db, isDatabaseConfigured } from "@/lib/db";
import {
  agentRuns,
  items,
  organizations,
  riskSnapshots,
  type RiskScoreComponent,
} from "@/lib/db/schema";
import { env, integrations } from "@/lib/env";
import { SCORING_VERSION } from "@/lib/risk/scoring";

export type GraphNode =
  | "supervisor"
  | "fda_shortage_agent"
  | "recall_agent"
  | "supplier_exposure_agent"
  | "inventory_agent"
  | "external_risk_agent"
  | "deterministic_scorer"
  | "import_mapping_agent"
  | "briefing_agent"
  | "critic_compliance_guard"
  | "human_approval_gate";

export type DailyBriefWorkflowStatus =
  | "succeeded"
  | "ai_not_configured"
  | "ai_fallback"
  | "blocked"
  | "awaiting_human_approval";

export interface AiWorkflowSnapshot {
  id: string;
  itemId: string;
  itemName: string;
  scoringVersion: string;
  riskScore: number;
  riskLevel: Severity;
  confidence: number | null;
  stalenessStatus: StalenessStatus;
  computedAt: Date;
  components: RiskScoreComponent[];
  inputs: Record<string, unknown>;
  changeSummary: Record<string, unknown> | null;
}

export interface ImportMappingSuggestion {
  sourceHeader: string;
  targetField: string | null;
  confidence: number;
  reason: string;
}

export interface AgentDraft {
  node: GraphNode;
  status: "drafted" | "skipped" | "failed";
  text: string;
}

export interface DeterministicScoreSummary {
  scoringVersion: string;
  snapshotCount: number;
  changedCount: number;
  criticalCount: number;
  highCount: number;
  averageConfidence: number;
  highestRisk:
    | {
        snapshotId: string;
        itemId: string;
        itemName: string;
        riskLevel: Severity;
        riskScore: number;
        stalenessStatus: StalenessStatus;
      }
    | null;
}

export interface DailyBriefWorkflowInput {
  organizationId: string;
  asOf?: Date | string;
  snapshots?: AiWorkflowSnapshot[];
  importHeaders?: string[];
}

export interface DailyBriefResult {
  status: DailyBriefWorkflowStatus;
  runId: string | null;
  langsmithRunId: string | null;
  model: string;
  draft: string | null;
  importMapping: ImportMappingSuggestion[];
  requiresHumanApproval: boolean;
  compliance: ComplianceReport;
  scoreSummary: DeterministicScoreSummary;
  agentDrafts: Partial<Record<GraphNode, AgentDraft>>;
}

export interface AiWorkflowRunSummary {
  ok: boolean;
  skipped?: "database-unconfigured";
  tenants: number;
  runs: number;
  blocked: number;
  awaitingApproval: number;
  failed: number;
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-fable-5";

/** Nodes implemented by code and never delegated to an LLM. */
export const DETERMINISTIC_NODES: ReadonlySet<GraphNode> = new Set([
  "deterministic_scorer",
  "import_mapping_agent",
  "critic_compliance_guard",
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
    "import_mapping_agent",
    "briefing_agent",
    "critic_compliance_guard",
    "human_approval_gate",
  ],
  scoringVersion: SCORING_VERSION,
};

type Drafts = Partial<Record<GraphNode, AgentDraft>>;

const WorkflowAnnotation = Annotation.Root({
  organizationId: Annotation<string>(),
  asOf: Annotation<string>(),
  snapshots: Annotation<AiWorkflowSnapshot[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  importHeaders: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  agentDrafts: Annotation<Drafts>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  importMapping: Annotation<ImportMappingSuggestion[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  scoreSummary: Annotation<DeterministicScoreSummary | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  finalDraft: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  compliance: Annotation<ComplianceReport | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  requiresHumanApproval: Annotation<boolean>({
    reducer: (_left, right) => right,
    default: () => false,
  }),
  status: Annotation<DailyBriefWorkflowStatus>({
    reducer: (_left, right) => right,
    default: () => "ai_not_configured",
  }),
  model: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => getAnthropicModel(),
  }),
  modelError: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
});

type WorkflowState = typeof WorkflowAnnotation.State;
type WorkflowUpdate = Partial<WorkflowState>;

export async function runDailyBriefWorkflows(options: {
  asOf?: Date;
} = {}): Promise<AiWorkflowRunSummary> {
  if (!isDatabaseConfigured) {
    return {
      ok: false,
      skipped: "database-unconfigured",
      tenants: 0,
      runs: 0,
      blocked: 0,
      awaitingApproval: 0,
      failed: 0,
    };
  }

  const asOf = options.asOf ?? new Date();
  const orgRows = await db.select({ id: organizations.id }).from(organizations);
  let runs = 0;
  let blocked = 0;
  let awaitingApproval = 0;
  let failed = 0;

  for (const org of orgRows) {
    try {
      const result = await runDailyBriefWorkflow({
        organizationId: org.id,
        asOf,
      });
      runs += 1;
      if (result.status === "blocked") blocked += 1;
      if (result.status === "awaiting_human_approval") awaitingApproval += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    ok: failed === 0,
    tenants: orgRows.length,
    runs,
    blocked,
    awaitingApproval,
    failed,
  };
}

export async function runDailyBriefWorkflow(
  input: DailyBriefWorkflowInput,
): Promise<DailyBriefResult> {
  configureLangSmith();
  const startedAt = new Date();
  const asOf = parseDate(input.asOf ?? startedAt);
  const snapshots =
    input.snapshots ?? (await loadLatestSnapshots(input.organizationId));
  const model = getAnthropicModel();
  const initialState: WorkflowState = {
    organizationId: input.organizationId,
    asOf: asOf.toISOString(),
    snapshots,
    importHeaders: input.importHeaders ?? [],
    agentDrafts: {},
    importMapping: [],
    scoreSummary: null,
    finalDraft: null,
    compliance: null,
    requiresHumanApproval: false,
    status: integrations.ai ? "succeeded" : "ai_not_configured",
    model,
    modelError: null,
  };

  const runId = await createAgentRun({
    organizationId: input.organizationId,
    model,
    startedAt,
    input: buildAgentRunInput(initialState),
  });

  try {
    const graph = buildDailyBriefGraph();
    const result = await graph.invoke(initialState);
    const compliance = result.compliance ?? { blocked: false, violations: [] };
    const scoreSummary =
      result.scoreSummary ?? buildScoreSummary([], SCORING_VERSION);
    const langsmithRunId = await createLangSmithTrace({
      state: result,
      startedAt,
      finishedAt: new Date(),
    });

    const output = {
      status: result.status,
      requiresHumanApproval: result.requiresHumanApproval,
      model: result.model,
      modelError: result.modelError,
      draft: result.finalDraft,
      importMapping: result.importMapping,
      compliance,
      scoreSummary,
      langsmithRunId,
    };
    await finishAgentRun({
      runId,
      organizationId: input.organizationId,
      status: "succeeded",
      output,
      langsmithRunId,
      finishedAt: new Date(),
    });

    return {
      status: result.status,
      runId,
      langsmithRunId,
      model: result.model,
      draft: result.finalDraft,
      importMapping: result.importMapping,
      requiresHumanApproval: result.requiresHumanApproval,
      compliance,
      scoreSummary,
      agentDrafts: result.agentDrafts,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    await finishAgentRun({
      runId,
      organizationId: input.organizationId,
      status: "failed",
      output: { error: message },
      error: message,
      finishedAt: new Date(),
    });
    throw error;
  }
}

export function buildDailyBriefGraph() {
  return new StateGraph(WorkflowAnnotation)
    .addNode("supervisor", supervisorNode)
    .addNode("fda_shortage_agent", domainAgentNode("fda_shortage_agent", ["shortage"]))
    .addNode("recall_agent", domainAgentNode("recall_agent", ["recall"]))
    .addNode(
      "supplier_exposure_agent",
      domainAgentNode("supplier_exposure_agent", [
        "supplier",
        "sanctions",
        "geopolitical",
        "logistics",
      ]),
    )
    .addNode("inventory_agent", domainAgentNode("inventory_agent", ["inventory", "procurement"]))
    .addNode(
      "external_risk_agent",
      domainAgentNode("external_risk_agent", [
        "weather",
        "disaster",
        "cyber",
        "infrastructure",
      ]),
    )
    .addNode("deterministic_scorer", deterministicScorerNode)
    .addNode("import_mapping_agent", importMappingAgentNode)
    .addNode("briefing_agent", briefingAgentNode)
    .addNode("critic_compliance_guard", complianceGuardNode)
    .addNode("human_approval_gate", humanApprovalGateNode)
    .addEdge(START, "supervisor")
    .addEdge("supervisor", "fda_shortage_agent")
    .addEdge("fda_shortage_agent", "recall_agent")
    .addEdge("recall_agent", "supplier_exposure_agent")
    .addEdge("supplier_exposure_agent", "inventory_agent")
    .addEdge("inventory_agent", "external_risk_agent")
    .addEdge("external_risk_agent", "deterministic_scorer")
    .addEdge("deterministic_scorer", "import_mapping_agent")
    .addEdge("import_mapping_agent", "briefing_agent")
    .addEdge("briefing_agent", "critic_compliance_guard")
    .addEdge("critic_compliance_guard", "human_approval_gate")
    .addEdge("human_approval_gate", END)
    .compile();
}

export function buildImportMappingSuggestions(
  headers: string[],
): ImportMappingSuggestion[] {
  return headers.map((header) => {
    const normalized = normalizeHeader(header);
    const match = IMPORT_FIELD_PATTERNS.find(({ patterns }) =>
      patterns.some((pattern) => normalized.includes(pattern)),
    );
    return {
      sourceHeader: header,
      targetField: match?.targetField ?? null,
      confidence: match ? 0.86 : 0.2,
      reason: match
        ? `Matched "${header}" to ${match.targetField}.`
        : `No safe catalog field matched "${header}".`,
    };
  });
}

export function buildDeterministicBriefDraft(
  state: Pick<WorkflowState, "snapshots" | "agentDrafts" | "scoreSummary" | "asOf">,
): string {
  const summary = state.scoreSummary ?? buildScoreSummary(state.snapshots, SCORING_VERSION);
  const lines = [
    `Daily supply risk brief for ${new Date(state.asOf).toISOString().slice(0, 10)}.`,
    summary.highestRisk
      ? `Highest risk item: ${summary.highestRisk.itemName} at ${Math.round(
          summary.highestRisk.riskScore,
        )}/100 (${summary.highestRisk.riskLevel}).`
      : "No scored items are available for review.",
    `${summary.changedCount} scored item(s) changed since the previous snapshot.`,
    `${summary.criticalCount} critical and ${summary.highCount} high-risk item(s) need operations review.`,
    `Average confidence is ${Math.round(summary.averageConfidence * 100)}%.`,
  ];

  for (const node of [
    "fda_shortage_agent",
    "recall_agent",
    "supplier_exposure_agent",
    "inventory_agent",
    "external_risk_agent",
  ] satisfies GraphNode[]) {
    const draft = state.agentDrafts[node];
    if (draft?.text) lines.push(draft.text);
  }

  return lines.join(" ");
}

function supervisorNode(state: WorkflowState): WorkflowUpdate {
  return {
    model: getAnthropicModel(),
    agentDrafts: {
      supervisor: {
        node: "supervisor",
        status: "drafted",
        text: `Supervisor routed ${state.snapshots.length} scored item(s) through controlled agents.`,
      },
    },
  };
}

function domainAgentNode(node: GraphNode, domains: RiskDomain[]) {
  return (state: WorkflowState): WorkflowUpdate => {
    const relevant = state.snapshots.filter((snapshot) =>
      domains.some((domain) => snapshotUsesDomain(snapshot, domain)),
    );
    const highest = sortByRisk(relevant)[0];
    return {
      agentDrafts: {
        [node]: {
          node,
          status: relevant.length > 0 ? "drafted" : "skipped",
          text: highest
            ? `${formatNodeName(node)} found ${relevant.length} relevant item(s); highest is ${highest.itemName} at ${Math.round(highest.riskScore)}/100.`
            : `${formatNodeName(node)} found no relevant active signals.`,
        },
      },
    };
  };
}

function deterministicScorerNode(state: WorkflowState): WorkflowUpdate {
  const scoreSummary = buildScoreSummary(state.snapshots, SCORING_VERSION);
  return {
    scoreSummary,
    requiresHumanApproval: scoreSummary.criticalCount > 0,
    agentDrafts: {
      deterministic_scorer: {
        node: "deterministic_scorer",
        status: "drafted",
        text: `Code-owned scoring summarized ${scoreSummary.snapshotCount} snapshot(s) under ${scoreSummary.scoringVersion}.`,
      },
    },
  };
}

function importMappingAgentNode(state: WorkflowState): WorkflowUpdate {
  const suggestions = buildImportMappingSuggestions(state.importHeaders);
  const mapped = suggestions.filter((suggestion) => suggestion.targetField).length;
  return {
    importMapping: suggestions,
    agentDrafts: {
      import_mapping_agent: {
        node: "import_mapping_agent",
        status: state.importHeaders.length > 0 ? "drafted" : "skipped",
        text:
          state.importHeaders.length > 0
            ? `Drafted ${mapped}/${state.importHeaders.length} safe CSV header mapping(s).`
            : "No import headers supplied for mapping.",
      },
    },
  };
}

async function briefingAgentNode(state: WorkflowState): Promise<WorkflowUpdate> {
  const fallbackDraft = buildDeterministicBriefDraft(state);
  if (!integrations.ai || !env.ai.anthropicApiKey) {
    return {
      finalDraft: fallbackDraft,
      status: "ai_not_configured",
      agentDrafts: {
        briefing_agent: {
          node: "briefing_agent",
          status: "skipped",
          text: "AI provider is not configured; deterministic brief draft used.",
        },
      },
    };
  }

  try {
    const draft = await draftWithAnthropic(state);
    return {
      finalDraft: draft,
      status: "succeeded",
      agentDrafts: {
        briefing_agent: {
          node: "briefing_agent",
          status: "drafted",
          text: "Anthropic draft generated from redaction-safe risk metadata.",
        },
      },
    };
  } catch (error) {
    return {
      finalDraft: fallbackDraft,
      status: "ai_fallback",
      modelError: getErrorMessage(error),
      agentDrafts: {
        briefing_agent: {
          node: "briefing_agent",
          status: "failed",
          text: "AI drafting failed; deterministic brief draft used.",
        },
      },
    };
  }
}

function complianceGuardNode(state: WorkflowState): WorkflowUpdate {
  const texts = [
    state.finalDraft ?? "",
    ...Object.values(state.agentDrafts).map((draft) => draft.text),
    ...state.importMapping.flatMap((suggestion) => [
      suggestion.sourceHeader,
      suggestion.reason,
    ]),
  ];
  const compliance = assessCompliance(texts);
  const safeImportMapping = compliance.blocked
    ? state.importMapping.map((suggestion) => ({
        ...suggestion,
        sourceHeader: redactSensitiveText(suggestion.sourceHeader),
        reason: redactSensitiveText(suggestion.reason),
      }))
    : state.importMapping;
  const safeDrafts = compliance.blocked
    ? (Object.fromEntries(
        Object.entries(state.agentDrafts).map(([node, draft]) => [
          node,
          { ...draft, text: redactSensitiveText(draft.text) },
        ]),
      ) as Drafts)
    : state.agentDrafts;
  return {
    compliance,
    importMapping: safeImportMapping,
    finalDraft: compliance.blocked ? null : state.finalDraft,
    status: compliance.blocked ? "blocked" : state.status,
    agentDrafts: {
      ...safeDrafts,
      critic_compliance_guard: {
        node: "critic_compliance_guard",
        status: compliance.blocked ? "failed" : "drafted",
        text: compliance.blocked
          ? `Blocked draft with ${compliance.violations.length} compliance violation(s).`
          : "Compliance guard passed: no PHI, EHR, treatment, substitution, or patient-level workflow language detected.",
      },
    },
  };
}

function humanApprovalGateNode(state: WorkflowState): WorkflowUpdate {
  if (state.compliance?.blocked) return { status: "blocked" };
  return {
    status: state.requiresHumanApproval ? "awaiting_human_approval" : state.status,
    agentDrafts: {
      human_approval_gate: {
        node: "human_approval_gate",
        status: "drafted",
        text: state.requiresHumanApproval
          ? "Critical risk detected; critical alert delivery remains gated by human approval tasks."
          : "No critical risk detected for the human approval gate.",
      },
    },
  };
}

function buildScoreSummary(
  snapshots: AiWorkflowSnapshot[],
  scoringVersion: string,
): DeterministicScoreSummary {
  const sorted = sortByRisk(snapshots);
  const highest = sorted[0] ?? null;
  const averageConfidence =
    snapshots.length === 0
      ? 0
      : round(
          snapshots.reduce((sum, snapshot) => sum + (snapshot.confidence ?? 0.5), 0) /
            snapshots.length,
          2,
        );

  return {
    scoringVersion,
    snapshotCount: snapshots.length,
    changedCount: snapshots.filter((snapshot) => snapshot.changeSummary?.changed === true)
      .length,
    criticalCount: snapshots.filter((snapshot) => snapshot.riskLevel === "critical")
      .length,
    highCount: snapshots.filter((snapshot) => snapshot.riskLevel === "high").length,
    averageConfidence,
    highestRisk: highest
      ? {
          snapshotId: highest.id,
          itemId: highest.itemId,
          itemName: highest.itemName,
          riskLevel: highest.riskLevel,
          riskScore: highest.riskScore,
          stalenessStatus: highest.stalenessStatus,
        }
      : null,
  };
}

async function draftWithAnthropic(state: WorkflowState): Promise<string> {
  const apiKey = env.ai.anthropicApiKey;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const promptPayload = buildAiPromptPayload(state);
  const promptCompliance = assessCompliance([JSON.stringify(promptPayload)]);
  if (promptCompliance.blocked) {
    throw new Error("AI prompt blocked by compliance preflight.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: getAnthropicModel(),
      max_tokens: 700,
      temperature: 0.2,
      system: [
        "You draft healthcare operations supply resilience briefs.",
        "Do not include PHI, EHR integration, diagnosis, treatment, drug substitution, or patient-specific guidance.",
        "Do not compute or change risk scores. Use only the deterministic score summary supplied by code.",
        "Write concise operations review language with evidence, freshness, and confidence references.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: JSON.stringify(promptPayload),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic drafting failed with ${response.status}.`);
  }
  const payload = (await response.json()) as AnthropicMessageResponse;
  const text = payload.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();
  if (!text) throw new Error("Anthropic returned an empty draft.");
  return redactSensitiveText(text);
}

async function loadLatestSnapshots(
  organizationId: string,
): Promise<AiWorkflowSnapshot[]> {
  if (!isDatabaseConfigured) return [];

  const latestSnapshot = db
    .select({
      itemId: riskSnapshots.itemId,
      computedAt: sql<Date>`max(${riskSnapshots.computedAt})`.as("computed_at"),
    })
    .from(riskSnapshots)
    .where(eq(riskSnapshots.organizationId, organizationId))
    .groupBy(riskSnapshots.itemId)
    .as("latest_snapshot");

  return db
    .select({
      id: riskSnapshots.id,
      itemId: riskSnapshots.itemId,
      itemName: items.name,
      scoringVersion: riskSnapshots.scoringVersion,
      riskScore: riskSnapshots.riskScore,
      riskLevel: riskSnapshots.riskLevel,
      confidence: riskSnapshots.confidence,
      stalenessStatus: riskSnapshots.stalenessStatus,
      computedAt: riskSnapshots.computedAt,
      components: riskSnapshots.components,
      inputs: riskSnapshots.inputs,
      changeSummary: riskSnapshots.changeSummary,
    })
    .from(riskSnapshots)
    .innerJoin(
      latestSnapshot,
      and(
        eq(riskSnapshots.itemId, latestSnapshot.itemId),
        eq(riskSnapshots.computedAt, latestSnapshot.computedAt),
      ),
    )
    .innerJoin(
      items,
      and(eq(riskSnapshots.itemId, items.id), eq(items.organizationId, organizationId)),
    )
    .where(eq(riskSnapshots.organizationId, organizationId))
    .orderBy(desc(riskSnapshots.computedAt));
}

async function createAgentRun({
  organizationId,
  model,
  startedAt,
  input,
}: {
  organizationId: string;
  model: string;
  startedAt: Date;
  input: Record<string, unknown>;
}) {
  if (!isDatabaseConfigured) return null;
  const [row] = await db
    .insert(agentRuns)
    .values({
      organizationId,
      graph: "daily_brief_workflow",
      node: "supervisor",
      status: "running",
      input,
      model,
      startedAt,
    })
    .returning({ id: agentRuns.id });
  return row?.id ?? null;
}

async function finishAgentRun({
  runId,
  organizationId,
  status,
  output,
  langsmithRunId,
  error,
  finishedAt,
}: {
  runId: string | null;
  organizationId: string;
  status: "succeeded" | "failed";
  output: Record<string, unknown>;
  langsmithRunId?: string | null;
  error?: string;
  finishedAt: Date;
}) {
  if (!runId || !isDatabaseConfigured) return;
  await db
    .update(agentRuns)
    .set({
      status,
      output,
      langsmithRunId,
      error,
      finishedAt,
    })
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.organizationId, organizationId)));
}

async function createLangSmithTrace({
  state,
  startedAt,
  finishedAt,
}: {
  state: WorkflowState;
  startedAt: Date;
  finishedAt: Date;
}): Promise<string | null> {
  if (!isLangSmithEnabled) return null;
  try {
    const id = randomUUID();
    const client = new LangSmithClient({
      apiKey: env.langsmith.apiKey,
      apiUrl: env.langsmith.endpoint,
    });
    await client.createRun({
      id,
      name: "daily_brief_workflow",
      run_type: "chain",
      project_name: env.langsmith.project,
      start_time: startedAt.toISOString(),
      end_time: finishedAt.toISOString(),
      inputs: sanitizeTracePayload(buildTraceInput(state)) as Record<string, unknown>,
      outputs: sanitizeTracePayload(buildTraceOutput(state)) as Record<string, unknown>,
      extra: {
        metadata: {
          graph: "daily_brief_workflow",
          model: state.model,
          scoringVersion: state.scoreSummary?.scoringVersion ?? SCORING_VERSION,
        },
      },
    });
    await client.flush();
    return id;
  } catch {
    return null;
  }
}

function buildAiPromptPayload(state: WorkflowState) {
  const summary = state.scoreSummary ?? buildScoreSummary(state.snapshots, SCORING_VERSION);
  return {
    asOf: state.asOf,
    scoreSummary: summary,
    agentSummaries: Object.fromEntries(
      Object.entries(state.agentDrafts).map(([node, draft]) => [node, draft.text]),
    ),
    topSnapshots: sortByRisk(state.snapshots).slice(0, 5).map((snapshot) => ({
      itemName: snapshot.itemName,
      riskScore: snapshot.riskScore,
      riskLevel: snapshot.riskLevel,
      confidence: snapshot.confidence,
      stalenessStatus: snapshot.stalenessStatus,
      computedAt: snapshot.computedAt.toISOString(),
      signalDomains: extractSignalDomains(snapshot.inputs),
      componentFactors: snapshot.components.map((component) => component.factor),
      changed: snapshot.changeSummary?.changed === true,
    })),
  };
}

function buildAgentRunInput(state: WorkflowState): Record<string, unknown> {
  return {
    organizationId: state.organizationId,
    asOf: state.asOf,
    snapshotCount: state.snapshots.length,
    importHeaderCount: state.importHeaders.length,
    model: state.model,
    scoringVersion: SCORING_VERSION,
  };
}

function buildTraceInput(state: WorkflowState): Record<string, unknown> {
  return {
    organizationRef: hashForTrace(state.organizationId),
    asOf: state.asOf,
    snapshotCount: state.snapshots.length,
    importHeaderCount: state.importHeaders.length,
    model: state.model,
    scoringVersion: SCORING_VERSION,
  };
}

function buildTraceOutput(state: WorkflowState): Record<string, unknown> {
  return {
    status: state.status,
    requiresHumanApproval: state.requiresHumanApproval,
    complianceBlocked: state.compliance?.blocked ?? false,
    violationCategories: state.compliance?.violations.map((v) => v.category) ?? [],
    scoreSummary: state.scoreSummary,
    modelError: state.modelError ? "[redacted-error]" : null,
  };
}

function snapshotUsesDomain(snapshot: AiWorkflowSnapshot, domain: RiskDomain): boolean {
  return extractSignalDomains(snapshot.inputs).includes(domain);
}

function extractSignalDomains(inputs: Record<string, unknown>): RiskDomain[] {
  const rawSignals = Array.isArray(inputs.signals) ? inputs.signals : [];
  const domains = new Set<RiskDomain>();
  for (const raw of rawSignals) {
    if (!raw || typeof raw !== "object") continue;
    const domain = (raw as { domain?: unknown }).domain;
    if (isRiskDomain(domain)) domains.add(domain);
  }
  return Array.from(domains).sort();
}

function isRiskDomain(value: unknown): value is RiskDomain {
  return (
    typeof value === "string" &&
    [
      "shortage",
      "recall",
      "supplier",
      "inventory",
      "procurement",
      "weather",
      "disaster",
      "geopolitical",
      "sanctions",
      "cyber",
      "infrastructure",
      "logistics",
      "other",
    ].includes(value)
  );
}

function sortByRisk(snapshots: AiWorkflowSnapshot[]) {
  return [...snapshots].sort(
    (a, b) =>
      severityRank(b.riskLevel) - severityRank(a.riskLevel) ||
      b.riskScore - a.riskScore ||
      a.itemName.localeCompare(b.itemName),
  );
}

function severityRank(level: Severity) {
  return {
    info: 0,
    low: 1,
    moderate: 2,
    high: 3,
    critical: 4,
  }[level];
}

function formatNodeName(node: GraphNode) {
  return node.replace(/_/g, " ");
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("asOf must be a valid date.");
  }
  return parsed;
}

function getAnthropicModel() {
  return env.ai.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown AI workflow error.";
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hashForTrace(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

const IMPORT_FIELD_PATTERNS: Array<{
  targetField: string;
  patterns: string[];
}> = [
  { targetField: "supplierName", patterns: ["supplier", "vendor", "manufacturer"] },
  { targetField: "name", patterns: ["item name", "product name", "name"] },
  { targetField: "category", patterns: ["category", "item category"] },
  { targetField: "criticality", patterns: ["criticality", "critical"] },
  { targetField: "internalSku", patterns: ["sku", "internal sku", "item sku"] },
  { targetField: "unitOfMeasure", patterns: ["uom", "unit", "unit of measure"] },
  { targetField: "parLevel", patterns: ["par", "par level"] },
  { targetField: "reorderPoint", patterns: ["reorder", "reorder point"] },
  { targetField: "countryOfOrigin", patterns: ["country", "origin"] },
  { targetField: "ndc", patterns: ["ndc"] },
  { targetField: "gtin", patterns: ["gtin"] },
  { targetField: "upc", patterns: ["upc"] },
  { targetField: "mpn", patterns: ["mpn", "manufacturer part"] },
  { targetField: "daysOnHand", patterns: ["days on hand", "doh"] },
];

interface AnthropicMessageResponse {
  content: Array<
    | {
        type: "text";
        text: string;
      }
    | {
        type: string;
        [key: string]: unknown;
      }
  >;
}
