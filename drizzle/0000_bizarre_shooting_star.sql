CREATE TYPE "public"."actor_type" AS ENUM('user', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."alert_channel" AS ENUM('in_app', 'email', 'slack', 'teams');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('pending', 'awaiting_approval', 'approved', 'rejected', 'queued', 'sent', 'failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."criticality" AS ENUM('low', 'medium', 'high', 'life_critical');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('item', 'ndc', 'gtin', 'supplier', 'supplier_site', 'manufacturer', 'country', 'port', 'route', 'chokepoint', 'facility', 'region', 'other');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('source_document', 'api_response', 'csv_row', 'computed', 'external_link', 'other');--> statement-breakpoint
CREATE TYPE "public"."facility_type" AS ENUM('hospital', 'clinic', 'pharmacy', 'warehouse', 'other');--> statement-breakpoint
CREATE TYPE "public"."identifier_type" AS ENUM('ndc', 'gtin', 'upc', 'hibcc', 'sku', 'mpn', 'fda_app_no', 'rxcui', 'other');--> statement-breakpoint
CREATE TYPE "public"."item_category" AS ENUM('drug', 'device', 'iv_fluid', 'ppe', 'oxygen', 'lab_reagent', 'sterile_supply', 'consumable', 'other');--> statement-breakpoint
CREATE TYPE "public"."procurement_event_type" AS ENUM('po_created', 'po_updated', 'partial_fill', 'backorder', 'delayed_shipment', 'received', 'cancelled', 'other');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('open', 'in_review', 'approved', 'rejected', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."risk_domain" AS ENUM('shortage', 'recall', 'supplier', 'inventory', 'procurement', 'weather', 'disaster', 'geopolitical', 'sanctions', 'cyber', 'infrastructure', 'logistics', 'other');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('info', 'low', 'moderate', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."signal_status" AS ENUM('active', 'resolved', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."staleness_status" AS ENUM('fresh', 'aging', 'stale', 'expired', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."supplier_type" AS ENUM('manufacturer', 'distributor', 'wholesaler', 'gpo', 'other');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"graph" text NOT NULL,
	"node" text,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"langsmith_run_id" text,
	"trace_url" text,
	"model" text,
	"usage" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"rule_id" uuid,
	"item_id" uuid,
	"signal_id" uuid,
	"snapshot_id" uuid,
	"severity" "severity" NOT NULL,
	"channel" "alert_channel" NOT NULL,
	"status" "alert_status" DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" double precision,
	"freshness" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"domain" "risk_domain",
	"min_severity" "severity" DEFAULT 'high' NOT NULL,
	"item_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"facility_id" uuid,
	"channels" "alert_channel"[] DEFAULT '{}' NOT NULL,
	"cooldown_minutes" integer DEFAULT 720 NOT NULL,
	"require_approval_for_critical" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"signal_id" uuid,
	"snapshot_id" uuid,
	"type" "evidence_type" DEFAULT 'source_document' NOT NULL,
	"title" text,
	"url" text,
	"source_name" text,
	"captured_at" timestamp with time zone NOT NULL,
	"content_hash" text,
	"storage_ref" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "facility_type" DEFAULT 'hospital' NOT NULL,
	"external_id" text,
	"country" text,
	"region" text,
	"city" text,
	"latitude" double precision,
	"longitude" double precision,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_review_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"status" "review_status" DEFAULT 'open' NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"title" text NOT NULL,
	"description" text,
	"assigned_to" text,
	"decision" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"facility_id" uuid,
	"on_hand_qty" double precision,
	"on_order_qty" double precision,
	"days_on_hand" double precision,
	"burn_rate_per_day" double precision,
	"as_of" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'csv_import' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"type" "identifier_type" NOT NULL,
	"value" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_site_id" uuid,
	"role" text DEFAULT 'primary' NOT NULL,
	"lead_time_days" integer,
	"is_sole_source" boolean DEFAULT false NOT NULL,
	"contract_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" "item_category" DEFAULT 'other' NOT NULL,
	"criticality" "criticality" DEFAULT 'medium' NOT NULL,
	"is_watched" boolean DEFAULT true NOT NULL,
	"internal_sku" text,
	"unit_of_measure" text,
	"par_level" integer,
	"reorder_point" integer,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurement_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"item_id" uuid,
	"supplier_id" uuid,
	"facility_id" uuid,
	"type" "procurement_event_type" NOT NULL,
	"po_number" text,
	"quantity" double precision,
	"filled_quantity" double precision,
	"expected_at" timestamp with time zone,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'csv_import' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"source" text NOT NULL,
	"domain" "risk_domain" NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text,
	"item_id" uuid,
	"supplier_id" uuid,
	"facility_id" uuid,
	"title" text NOT NULL,
	"summary" text,
	"severity" "severity" DEFAULT 'info' NOT NULL,
	"severity_score" double precision,
	"confidence" double precision,
	"status" "signal_status" DEFAULT 'active' NOT NULL,
	"observed_at" timestamp with time zone,
	"source_published_at" timestamp with time zone,
	"last_fetched_at" timestamp with time zone,
	"staleness_status" "staleness_status" DEFAULT 'unknown' NOT NULL,
	"evidence_url" text,
	"raw_payload_ref" text,
	"dedupe_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"facility_id" uuid,
	"scoring_version" text NOT NULL,
	"risk_score" double precision NOT NULL,
	"risk_level" "severity" NOT NULL,
	"confidence" double precision,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"staleness_status" "staleness_status" DEFAULT 'unknown' NOT NULL,
	"worst_signal_at" timestamp with time zone,
	"rationale" text,
	"previous_snapshot_id" uuid,
	"change_summary" jsonb,
	"computed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"name" text NOT NULL,
	"site_type" text,
	"country" text,
	"region" text,
	"latitude" double precision,
	"longitude" double precision,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "supplier_type" DEFAULT 'manufacturer' NOT NULL,
	"duns" text,
	"external_id" text,
	"country_of_origin" text,
	"risk_notes" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_signal_id_risk_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."risk_signals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_snapshot_id_risk_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."risk_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "evidence_artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "evidence_artifacts_signal_id_risk_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."risk_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "evidence_artifacts_snapshot_id_risk_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."risk_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_review_tasks" ADD CONSTRAINT "human_review_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_identifiers" ADD CONSTRAINT "item_identifiers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_identifiers" ADD CONSTRAINT "item_identifiers_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_suppliers" ADD CONSTRAINT "item_suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_suppliers" ADD CONSTRAINT "item_suppliers_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_suppliers" ADD CONSTRAINT "item_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_suppliers" ADD CONSTRAINT "item_suppliers_supplier_site_id_supplier_sites_id_fk" FOREIGN KEY ("supplier_site_id") REFERENCES "public"."supplier_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_events" ADD CONSTRAINT "procurement_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_events" ADD CONSTRAINT "procurement_events_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_events" ADD CONSTRAINT "procurement_events_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_events" ADD CONSTRAINT "procurement_events_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_snapshots" ADD CONSTRAINT "risk_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_snapshots" ADD CONSTRAINT "risk_snapshots_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_snapshots" ADD CONSTRAINT "risk_snapshots_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_snapshots" ADD CONSTRAINT "risk_snapshots_previous_snapshot_id_risk_snapshots_id_fk" FOREIGN KEY ("previous_snapshot_id") REFERENCES "public"."risk_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_sites" ADD CONSTRAINT "supplier_sites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_sites" ADD CONSTRAINT "supplier_sites_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_org_idx" ON "agent_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_runs_graph_idx" ON "agent_runs" USING btree ("graph","status");--> statement-breakpoint
CREATE INDEX "alert_events_org_idx" ON "alert_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "alert_events_status_idx" ON "alert_events" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_events_dedupe_idx" ON "alert_events" USING btree ("organization_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "alert_rules_org_idx" ON "alert_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_log_org_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_subject_idx" ON "audit_log" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "evidence_artifacts_org_idx" ON "evidence_artifacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "evidence_artifacts_signal_idx" ON "evidence_artifacts" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "evidence_artifacts_snapshot_idx" ON "evidence_artifacts" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "facilities_org_idx" ON "facilities" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "facilities_org_external_idx" ON "facilities" USING btree ("organization_id","external_id");--> statement-breakpoint
CREATE INDEX "human_review_tasks_org_idx" ON "human_review_tasks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "human_review_tasks_status_idx" ON "human_review_tasks" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "inventory_snapshots_org_idx" ON "inventory_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inventory_snapshots_item_idx" ON "inventory_snapshots" USING btree ("item_id","as_of");--> statement-breakpoint
CREATE INDEX "item_identifiers_item_idx" ON "item_identifiers" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_identifiers_lookup_idx" ON "item_identifiers" USING btree ("organization_id","type","value");--> statement-breakpoint
CREATE UNIQUE INDEX "item_identifiers_unique_idx" ON "item_identifiers" USING btree ("organization_id","type","value");--> statement-breakpoint
CREATE INDEX "item_suppliers_org_idx" ON "item_suppliers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "item_suppliers_item_idx" ON "item_suppliers" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_suppliers_unique_idx" ON "item_suppliers" USING btree ("organization_id","item_id","supplier_id");--> statement-breakpoint
CREATE INDEX "items_org_idx" ON "items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "items_org_category_idx" ON "items" USING btree ("organization_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "items_org_sku_idx" ON "items" USING btree ("organization_id","internal_sku");--> statement-breakpoint
CREATE INDEX "procurement_events_org_idx" ON "procurement_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "procurement_events_item_idx" ON "procurement_events" USING btree ("item_id","occurred_at");--> statement-breakpoint
CREATE INDEX "risk_signals_org_idx" ON "risk_signals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "risk_signals_domain_idx" ON "risk_signals" USING btree ("organization_id","domain");--> statement-breakpoint
CREATE INDEX "risk_signals_item_idx" ON "risk_signals" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "risk_signals_supplier_idx" ON "risk_signals" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_signals_dedupe_idx" ON "risk_signals" USING btree ("organization_id","source","dedupe_key");--> statement-breakpoint
CREATE INDEX "risk_snapshots_org_idx" ON "risk_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "risk_snapshots_item_idx" ON "risk_snapshots" USING btree ("item_id","computed_at");--> statement-breakpoint
CREATE INDEX "risk_snapshots_level_idx" ON "risk_snapshots" USING btree ("organization_id","risk_level");--> statement-breakpoint
CREATE INDEX "supplier_sites_org_idx" ON "supplier_sites" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "supplier_sites_supplier_idx" ON "supplier_sites" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "suppliers_org_idx" ON "suppliers" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_org_external_idx" ON "suppliers" USING btree ("organization_id","external_id");