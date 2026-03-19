CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"owner_id" uuid NOT NULL,
	"public_key" varchar(255) NOT NULL,
	"api_key_hash" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"platform" varchar(100),
	"polling_interval_seconds" integer DEFAULT 60,
	"capabilities_manifest" jsonb DEFAULT '{}'::jsonb,
	"trust_tier_overrides" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agents_public_key_unique" UNIQUE("public_key"),
	CONSTRAINT "agents_status_check" CHECK ("agents"."status" IN ('active', 'suspended', 'deregistered'))
);
--> statement-breakpoint
CREATE TABLE "blocked_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_agent_id" uuid,
	"message_hash" varchar(255) NOT NULL,
	"matched_category" varchar(50) NOT NULL,
	"matched_pattern" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delegation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delegation_id" varchar(255) NOT NULL,
	"requester_agent_id" uuid NOT NULL,
	"provider_agent_id" uuid NOT NULL,
	"contract_id" varchar(255),
	"dct_hash" varchar(255) NOT NULL,
	"trust_tier" integer NOT NULL,
	"status" varchar(20) DEFAULT 'requested' NOT NULL,
	"cost_microcents" integer DEFAULT 0,
	"budget_microcents" integer DEFAULT 0,
	"attestation_hash" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "delegation_log_delegation_id_unique" UNIQUE("delegation_id"),
	CONSTRAINT "delegation_status_check" CHECK ("delegation_log"."status" IN ('requested', 'accepted', 'rejected', 'in_progress', 'completed', 'failed', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "escrow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delegation_id" varchar(255) NOT NULL,
	"payer_owner_id" uuid NOT NULL,
	"payee_owner_id" uuid NOT NULL,
	"amount_microcents" integer NOT NULL,
	"platform_fee_microcents" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'held' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_agent_id" uuid NOT NULL,
	"sender_agent_id" uuid,
	"message_type" varchar(30) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"delivered_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "inbox_message_type_check" CHECK ("inbox_messages"."message_type" IN ('delegation_request', 'delegation_response', 'task_result', 'revocation', 'system')),
	CONSTRAINT "inbox_status_check" CHECK ("inbox_messages"."status" IN ('pending', 'delivered', 'processed', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "owner_balances" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"balance_microcents" bigint DEFAULT 0 NOT NULL,
	"held_in_escrow_microcents" bigint DEFAULT 0 NOT NULL,
	"total_earned_microcents" bigint DEFAULT 0 NOT NULL,
	"total_spent_microcents" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"organization" varchar(255),
	"api_key_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "owners_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "trust_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_a_id" uuid NOT NULL,
	"owner_b_id" uuid NOT NULL,
	"tier" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "trust_tier_check" CHECK ("trust_relationships"."tier" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "trust_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"capability_namespace" varchar(100) NOT NULL,
	"composite_score" numeric(5, 4) DEFAULT '0.5',
	"reliability_score" numeric(5, 4) DEFAULT '0.5',
	"quality_score" numeric(5, 4) DEFAULT '0.5',
	"speed_score" numeric(5, 4) DEFAULT '0.5',
	"total_tasks" integer DEFAULT 0,
	"successful_tasks" integer DEFAULT 0,
	"last_updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_messages" ADD CONSTRAINT "blocked_messages_sender_agent_id_agents_id_fk" FOREIGN KEY ("sender_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegation_log" ADD CONSTRAINT "delegation_log_requester_agent_id_agents_id_fk" FOREIGN KEY ("requester_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegation_log" ADD CONSTRAINT "delegation_log_provider_agent_id_agents_id_fk" FOREIGN KEY ("provider_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow" ADD CONSTRAINT "escrow_delegation_id_delegation_log_delegation_id_fk" FOREIGN KEY ("delegation_id") REFERENCES "public"."delegation_log"("delegation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow" ADD CONSTRAINT "escrow_payer_owner_id_owners_id_fk" FOREIGN KEY ("payer_owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow" ADD CONSTRAINT "escrow_payee_owner_id_owners_id_fk" FOREIGN KEY ("payee_owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_recipient_agent_id_agents_id_fk" FOREIGN KEY ("recipient_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_sender_agent_id_agents_id_fk" FOREIGN KEY ("sender_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_balances" ADD CONSTRAINT "owner_balances_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_relationships" ADD CONSTRAINT "trust_relationships_owner_a_id_owners_id_fk" FOREIGN KEY ("owner_a_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_relationships" ADD CONSTRAINT "trust_relationships_owner_b_id_owners_id_fk" FOREIGN KEY ("owner_b_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_scores" ADD CONSTRAINT "trust_scores_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agents_owner_id" ON "agents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_agents_status" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_delegation_requester" ON "delegation_log" USING btree ("requester_agent_id");--> statement-breakpoint
CREATE INDEX "idx_delegation_provider" ON "delegation_log" USING btree ("provider_agent_id");--> statement-breakpoint
CREATE INDEX "idx_delegation_status" ON "delegation_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_inbox_recipient_status" ON "inbox_messages" USING btree ("recipient_agent_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trust_unique" ON "trust_relationships" USING btree ("owner_a_id","owner_b_id");--> statement-breakpoint
CREATE INDEX "idx_trust_owner_a" ON "trust_relationships" USING btree ("owner_a_id");--> statement-breakpoint
CREATE INDEX "idx_trust_owner_b" ON "trust_relationships" USING btree ("owner_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trust_scores_agent_capability" ON "trust_scores" USING btree ("agent_id","capability_namespace");