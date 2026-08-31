import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  automationRuns,
  automations,
  campaigns,
  customers,
  customerActivities,
  InsertUser,
  loyaltyRewards,
  loyaltyTransactions,
  organizationMembers,
  organizations,
  recoveryCases,
  tasks,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

/** Creates an isolated default workspace the first time a user enters the product. */
export async function ensureOrganizationForUser(user: { id: number; name: string | null; email: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const membership = (await db.select().from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id)).limit(1))[0];
  if (membership) return membership;

  const organization = await db.insert(organizations).values({
    name: user.name ? `${user.name.split(" ")[0]} Fitness` : "Minha academia",
    slug: `academia-${user.id}`,
    segment: "Academia",
  }).$returningId();
  const organizationId = organization[0]!.id;
  await db.insert(organizationMembers).values({ organizationId, userId: user.id, role: "owner" });
  return { id: 0, organizationId, userId: user.id, role: "owner" as const, createdAt: new Date() };
}

export async function getMembershipForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const member = (await db.select().from(organizationMembers)
    .where(eq(organizationMembers.userId, userId)).limit(1))[0];
  if (!member) return ensureOrganizationForUser({ id: userId, name: null, email: null });
  return member;
}

export async function getOrganizationForUser(user: { id: number; name: string | null; email: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const membership = await ensureOrganizationForUser(user);
  const organization = (await db.select().from(organizations)
    .where(eq(organizations.id, membership.organizationId)).limit(1))[0];
  if (!organization) throw new Error("Organization not found");
  return { organization, membership };
}

export async function getCustomer(orgId: number, customerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return (await db.select().from(customers)
    .where(and(eq(customers.organizationId, orgId), eq(customers.id, customerId))).limit(1))[0];
}

export async function listCustomers(orgId: number, filters: { query?: string; status?: "active" | "at_risk" | "inactive"; page?: number; pageSize?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const conditions = [eq(customers.organizationId, orgId)];
  if (filters.status) conditions.push(eq(customers.status, filters.status));
  if (filters.query?.trim()) {
    const escaped = `%${filters.query.trim().replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(sql`(${customers.name} LIKE ${escaped} ESCAPE '\\\\' OR ${customers.email} LIKE ${escaped} ESCAPE '\\\\' OR ${customers.phone} LIKE ${escaped} ESCAPE '\\\\')`);
  }
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 25));
  const [items, totalRow] = await Promise.all([
    db.select().from(customers).where(and(...conditions)).orderBy(desc(customers.lastPurchaseAt), desc(customers.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)` }).from(customers).where(and(...conditions)),
  ]);
  return { items, total: Number(totalRow[0]?.total ?? 0), page, pageSize };
}

export async function getCustomerDetail(orgId: number, customerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const customer = await getCustomer(orgId, customerId);
  if (!customer) return undefined;
  const [activities, openTasks, recovery] = await Promise.all([
    db.select().from(customerActivities).where(and(eq(customerActivities.organizationId, orgId), eq(customerActivities.customerId, customerId))).orderBy(desc(customerActivities.createdAt)).limit(40),
    db.select().from(tasks).where(and(eq(tasks.organizationId, orgId), eq(tasks.customerId, customerId), eq(tasks.status, "open"))).orderBy(asc(tasks.dueAt)),
    db.select().from(recoveryCases).where(and(eq(recoveryCases.organizationId, orgId), eq(recoveryCases.customerId, customerId))).limit(1),
  ]);
  return { customer, activities, openTasks, recovery: recovery[0] };
}

export async function dashboardMetrics(orgId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [statusRows, recoveryRows, taskRows, campaignRows, revenueRows] = await Promise.all([
    db.select({ status: customers.status, total: sql<number>`count(*)` }).from(customers).where(eq(customers.organizationId, orgId)).groupBy(customers.status),
    db.select({ status: recoveryCases.status, total: sql<number>`count(*)`, recoveredRevenue: sql<string>`coalesce(sum(${recoveryCases.recoveredValue}), 0)` }).from(recoveryCases).where(eq(recoveryCases.organizationId, orgId)).groupBy(recoveryCases.status),
    db.select({ total: sql<number>`count(*)` }).from(tasks).where(and(eq(tasks.organizationId, orgId), eq(tasks.status, "open"))),
    db.select({ total: sql<number>`count(*)`, sent: sql<number>`coalesce(sum(${campaigns.sentCount}),0)`, replies: sql<number>`coalesce(sum(${campaigns.repliedCount}),0)` }).from(campaigns).where(eq(campaigns.organizationId, orgId)),
    db.select({ total: sql<string>`coalesce(sum(${customers.totalSpent}), 0)` }).from(customers).where(eq(customers.organizationId, orgId)),
  ]);
  const map = new Map(statusRows.map(row => [row.status, Number(row.total)]));
  const recoveryMap = new Map(recoveryRows.map(row => [row.status, { total: Number(row.total), revenue: Number(row.recoveredRevenue) }]));
  const recoveredRevenue = Array.from(recoveryMap.values()).reduce((total, row) => total + row.revenue, 0);
  return {
    active: map.get("active") ?? 0,
    atRisk: map.get("at_risk") ?? 0,
    inactive: map.get("inactive") ?? 0,
    recovered: recoveryMap.get("recovered")?.total ?? 0,
    recoveredRevenue,
    pendingTasks: Number(taskRows[0]?.total ?? 0),
    campaigns: Number(campaignRows[0]?.total ?? 0),
    sentMessages: Number(campaignRows[0]?.sent ?? 0),
    replies: Number(campaignRows[0]?.replies ?? 0),
    totalRevenue: Number(revenueRows[0]?.total ?? 0),
  };
}

export async function listRecoveries(orgId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select({ recovery: recoveryCases, customer: customers }).from(recoveryCases)
    .innerJoin(customers, and(eq(customers.id, recoveryCases.customerId), eq(customers.organizationId, recoveryCases.organizationId)))
    .where(eq(recoveryCases.organizationId, orgId)).orderBy(desc(recoveryCases.updatedAt));
}

export async function listTasks(orgId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select({ task: tasks, customer: customers }).from(tasks)
    .leftJoin(customers, and(eq(customers.id, tasks.customerId), eq(customers.organizationId, tasks.organizationId)))
    .where(and(eq(tasks.organizationId, orgId), ne(tasks.status, "cancelled"))).orderBy(asc(tasks.dueAt), desc(tasks.createdAt));
}

export async function listAutomationRuns(orgId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select({ run: automationRuns, automation: automations }).from(automationRuns)
    .innerJoin(automations, eq(automationRuns.automationId, automations.id))
    .where(eq(automationRuns.organizationId, orgId)).orderBy(desc(automationRuns.startedAt)).limit(30);
}

export async function recentCustomersByStatus(orgId: number, status: "at_risk" | "inactive") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select().from(customers).where(and(eq(customers.organizationId, orgId), eq(customers.status, status))).orderBy(desc(customers.totalSpent)).limit(8);
}
