import { Play, Trash2 } from "lucide-react";

import {
  createAlertRuleAction,
  deleteAlertRuleAction,
  runAlertEvaluationAction,
  setAlertRuleEnabledAction,
  updateAlertRuleAction,
} from "@/lib/actions/alerts";
import {
  alertChannelEnum,
  riskDomainEnum,
  severityEnum,
  type AlertRule,
} from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatLabel } from "@/lib/utils";

// <form action={...}> requires a void-returning function; these actions now
// return a typed AlertActionOutcome (A19), so wrap for this fire-and-forget
// usage. Each needs its own "use server" — this file isn't a "use server" module.
async function createRule(formData: FormData): Promise<void> {
  "use server";
  await createAlertRuleAction(formData);
}

async function runEvaluation(): Promise<void> {
  "use server";
  await runAlertEvaluationAction();
}

async function setEnabled(ruleId: string, enabled: boolean): Promise<void> {
  "use server";
  await setAlertRuleEnabledAction(ruleId, enabled);
}

async function deleteRule(ruleId: string): Promise<void> {
  "use server";
  await deleteAlertRuleAction(ruleId);
}

async function updateRule(ruleId: string, formData: FormData): Promise<void> {
  "use server";
  await updateAlertRuleAction(ruleId, formData);
}

export function AlertRulesPanel({ rules }: { rules: AlertRule[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-medium">Create rule</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Match scored items by severity and optional risk domain.
          </p>
        </div>
        <form action={createRule} className="space-y-4 p-5">
          <label className="block text-sm font-medium">
            Name
            <Input name="name" className="mt-1" required placeholder="Critical shortages" />
          </label>
          <label className="block text-sm font-medium">
            Description
            <Input
              name="description"
              className="mt-1"
              placeholder="Notify the procurement lead"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Domain
              <select
                name="domain"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue="all"
              >
                <option value="all">All domains</option>
                {riskDomainEnum.enumValues.map((domain) => (
                  <option key={domain} value={domain}>
                    {formatLabel(domain)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Minimum severity
              <select
                name="minSeverity"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue="high"
              >
                {severityEnum.enumValues.map((severity) => (
                  <option key={severity} value={severity}>
                    {formatLabel(severity)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Channels</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {alertChannelEnum.enumValues.map((channel) => (
                <label key={channel} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="channels"
                    value={channel}
                    defaultChecked={channel === "in_app"}
                  />
                  {formatLabel(channel)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Cooldown minutes
              <Input
                name="cooldownMinutes"
                type="number"
                min={0}
                defaultValue={720}
                className="mt-1"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                name="requireApprovalForCritical"
                defaultChecked
              />
              Require approval for critical
            </label>
          </div>
          <Button type="submit">Create rule</Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-medium">Rules</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Evaluation creates events with evidence, freshness, and confidence.
            </p>
          </div>
          <form action={runEvaluation}>
            <Button type="submit" variant="outline" size="sm">
              <Play className="size-3.5" strokeWidth={1.75} />
              Evaluate
            </Button>
          </form>
        </div>
        {rules.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No rules yet. Daily in-app briefs still run after scoring snapshots exist.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rules.map((rule) => (
              <div key={rule.id} className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{rule.name}</h3>
                      <Badge variant={rule.enabled ? "default" : "secondary"}>
                        {rule.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Badge variant="secondary">{formatLabel(rule.minSeverity)}</Badge>
                    </div>
                    {rule.description && (
                      <p className="text-sm text-muted-foreground">{rule.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {rule.domain ? formatLabel(rule.domain) : "All domains"} -{" "}
                      {rule.channels.length
                        ? rule.channels.map(formatLabel).join(", ")
                        : "In App"}{" "}
                      - {rule.cooldownMinutes} min cooldown
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form
                      action={setEnabled.bind(
                        null,
                        rule.id,
                        !rule.enabled,
                      )}
                    >
                      <Button type="submit" variant="outline" size="sm">
                        {rule.enabled ? "Disable" : "Enable"}
                      </Button>
                    </form>
                    <form action={deleteRule.bind(null, rule.id)}>
                      <Button type="submit" variant="ghost" size="icon">
                        <Trash2 className="size-4" strokeWidth={1.75} />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </form>
                  </div>
                </div>
                <details className="rounded-lg border border-border bg-background p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Edit rule
                  </summary>
                  <form
                    action={updateRule.bind(null, rule.id)}
                    className="mt-4 space-y-4"
                  >
                    <label className="block text-sm font-medium">
                      Name
                      <Input name="name" className="mt-1" required defaultValue={rule.name} />
                    </label>
                    <label className="block text-sm font-medium">
                      Description
                      <Input
                        name="description"
                        className="mt-1"
                        defaultValue={rule.description ?? ""}
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm font-medium">
                        Domain
                        <select
                          name="domain"
                          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          defaultValue={rule.domain ?? "all"}
                        >
                          <option value="all">All domains</option>
                          {riskDomainEnum.enumValues.map((domain) => (
                            <option key={domain} value={domain}>
                              {formatLabel(domain)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-medium">
                        Minimum severity
                        <select
                          name="minSeverity"
                          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          defaultValue={rule.minSeverity}
                        >
                          {severityEnum.enumValues.map((severity) => (
                            <option key={severity} value={severity}>
                              {formatLabel(severity)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">Channels</legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {alertChannelEnum.enumValues.map((channel) => (
                          <label key={channel} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              name="channels"
                              value={channel}
                              defaultChecked={rule.channels.includes(channel)}
                            />
                            {formatLabel(channel)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm font-medium">
                        Cooldown minutes
                        <Input
                          name="cooldownMinutes"
                          type="number"
                          min={0}
                          defaultValue={rule.cooldownMinutes}
                          className="mt-1"
                        />
                      </label>
                      <label className="flex items-end gap-2 pb-2 text-sm">
                        <input
                          type="checkbox"
                          name="requireApprovalForCritical"
                          defaultChecked={rule.requireApprovalForCritical}
                        />
                        Require approval for critical
                      </label>
                    </div>
                    <Button type="submit" variant="outline">
                      Save changes
                    </Button>
                  </form>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
