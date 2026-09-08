import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Identidades autenticadas pelo Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  segment: varchar("segment", { length: 80 }).default("Academia").notNull(),
  plan: mysqlEnum("plan", ["basic", "professional", "premium", "enterprise"]).default("professional").notNull(),
  activeDays: int("activeDays").default(30).notNull(),
  riskDays: int("riskDays").default(60).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("America/Sao_Paulo").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const organizationMembers = mysqlTable("organization_members", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "manager", "operator", "viewer"]).default("operator").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("member_organization_user_unique").on(table.organizationId, table.userId),
  index("member_user_idx").on(table.userId),
]);

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  status: mysqlEnum("status", ["active", "at_risk", "inactive"]).default("active").notNull(),
  pipelineStage: mysqlEnum("pipelineStage", ["new", "contacted", "interested", "customer", "recurring"]).default("new").notNull(),
  registeredAt: timestamp("registeredAt").defaultNow().notNull(),
  lastPurchaseAt: timestamp("lastPurchaseAt"),
  totalSpent: decimal("totalSpent", { precision: 12, scale: 2 }).default("0").notNull(),
  points: int("points").default(0).notNull(),
  loyaltyToken: varchar("loyaltyToken", { length: 64 }).notNull().unique(),
  notes: text("notes"),
  lastInteractionAt: timestamp("lastInteractionAt"),
  consentWhatsapp: boolean("consentWhatsapp").default(false).notNull(),
  consentAt: timestamp("consentAt"),
  consentSource: varchar("consentSource", { length: 120 }),
  consentVersion: varchar("consentVersion", { length: 32 }),
  anonymizedAt: timestamp("anonymizedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("customer_org_status_idx").on(table.organizationId, table.status),
  index("customer_org_purchase_idx").on(table.organizationId, table.lastPurchaseAt),
]);

export const customerActivities = mysqlTable("customer_activities", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  customerId: int("customerId").notNull(),
  type: mysqlEnum("type", ["note", "purchase", "message", "status_change", "points", "recovery", "task"]).notNull(),
  content: text("content").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  metadata: json("metadata"),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("activity_customer_created_idx").on(table.customerId, table.createdAt),
  index("activity_org_idx").on(table.organizationId),
]);

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  customerId: int("customerId"),
  title: varchar("title", { length: 220 }).notNull(),
  description: text("description"),
  dueAt: timestamp("dueAt"),
  status: mysqlEnum("status", ["open", "done", "cancelled"]).default("open").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
  assignedToUserId: int("assignedToUserId"),
  createdByUserId: int("createdByUserId").notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("task_org_status_due_idx").on(table.organizationId, table.status, table.dueAt),
]);

export const automations = mysqlTable("automations", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  triggerType: mysqlEnum("triggerType", ["inactivity_days", "membership_due", "points_reached"]).notNull(),
  triggerValue: int("triggerValue").notNull(),
  actionType: mysqlEnum("actionType", ["set_at_risk", "set_inactive", "create_task", "queue_recovery", "award_points"]).notNull(),
  actionConfig: json("actionConfig"),
  enabled: boolean("enabled").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("automation_org_enabled_idx").on(table.organizationId, table.enabled),
  index("automation_cron_idx").on(table.scheduleCronTaskUid),
]);

export const automationRuns = mysqlTable("automation_runs", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  automationId: int("automationId").notNull(),
  status: mysqlEnum("status", ["success", "failed", "skipped"]).notNull(),
  affectedCount: int("affectedCount").default(0).notNull(),
  message: text("message").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt").defaultNow().notNull(),
}, table => [index("automation_run_org_idx").on(table.organizationId, table.startedAt)]);

export const recoveryCases = mysqlTable("recovery_cases", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  customerId: int("customerId").notNull(),
  status: mysqlEnum("status", ["pending", "contacted", "responded", "recovered", "lost"]).default("pending").notNull(),
  potentialValue: decimal("potentialValue", { precision: 12, scale: 2 }).default("0").notNull(),
  recoveredValue: decimal("recoveredValue", { precision: 12, scale: 2 }).default("0").notNull(),
  campaignId: int("campaignId"),
  contactedAt: timestamp("contactedAt"),
  respondedAt: timestamp("respondedAt"),
  recoveredAt: timestamp("recoveredAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("recovery_org_customer_unique").on(table.organizationId, table.customerId),
  index("recovery_org_status_idx").on(table.organizationId, table.status),
]);

export const loyaltyRewards = mysqlTable("loyalty_rewards", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  pointsCost: int("pointsCost").notNull(),
  couponCode: varchar("couponCode", { length: 64 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("reward_org_active_idx").on(table.organizationId, table.active)]);

export const loyaltyTransactions = mysqlTable("loyalty_transactions", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  customerId: int("customerId").notNull(),
  points: int("points").notNull(),
  reason: varchar("reason", { length: 180 }).notNull(),
  automationKey: varchar("automationKey", { length: 180 }),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("loyalty_customer_idx").on(table.customerId, table.createdAt), uniqueIndex("loyalty_automation_key_unique").on(table.automationKey)]);

export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  audience: mysqlEnum("audience", ["all", "active", "at_risk", "inactive"]).notNull(),
  message: text("message").notNull(),
  templateName: varchar("templateName", { length: 160 }),
  scheduledAt: timestamp("scheduledAt"),
  status: mysqlEnum("status", ["draft", "scheduled", "sent", "paused"]).default("draft").notNull(),
  sentCount: int("sentCount").default(0).notNull(),
  deliveredCount: int("deliveredCount").default(0).notNull(),
  repliedCount: int("repliedCount").default(0).notNull(),
  convertedCount: int("convertedCount").default(0).notNull(),
  revenueGenerated: decimal("revenueGenerated", { precision: 12, scale: 2 }).default("0").notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("campaign_org_status_idx").on(table.organizationId, table.status)]);

export const whatsappMessages = mysqlTable("whatsapp_messages", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  customerId: int("customerId"),
  campaignId: int("campaignId"),
  direction: mysqlEnum("direction", ["outbound", "inbound"]).notNull(),
  messageType: mysqlEnum("messageType", ["template", "text"]).default("template").notNull(),
  status: mysqlEnum("status", ["queued", "sent", "delivered", "read", "failed", "received"]).default("queued").notNull(),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  templateName: varchar("templateName", { length: 160 }),
  body: text("body"),
  errorMessage: text("errorMessage"),
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("whatsapp_org_status_idx").on(table.organizationId, table.status),
  uniqueIndex("whatsapp_provider_message_unique").on(table.providerMessageId),
]);

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  actorUserId: int("actorUserId"),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entityType", { length: 80 }),
  entityId: int("entityId"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("audit_org_created_idx").on(table.organizationId, table.createdAt), index("audit_entity_idx").on(table.entityType, table.entityId)]);

export const billingPayments = mysqlTable("billing_payments", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  requestedPlan: mysqlEnum("requestedPlan", ["basic", "professional", "premium"]).notNull(),
  previousPlan: mysqlEnum("previousPlan", ["basic", "professional", "premium", "enterprise"]),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("BRL").notNull(),
  checkoutId: varchar("checkoutId", { length: 100 }),
  providerPaymentId: varchar("providerPaymentId", { length: 100 }),
  externalReference: varchar("externalReference", { length: 200 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "confirmed", "received", "overdue", "cancelled", "refunded", "failed"]).default("pending").notNull(),
  lastEventId: varchar("lastEventId", { length: 180 }),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("billing_org_status_idx").on(table.organizationId, table.status), uniqueIndex("billing_provider_payment_unique").on(table.providerPaymentId), index("billing_event_idx").on(table.lastEventId)]);

export const asaasWebhookEvents = mysqlTable("asaas_webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 180 }).notNull().unique(),
  event: varchar("event", { length: 100 }).notNull(),
  providerPaymentId: varchar("providerPaymentId", { length: 100 }),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
}, table => [index("asaas_event_payment_idx").on(table.providerPaymentId)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
