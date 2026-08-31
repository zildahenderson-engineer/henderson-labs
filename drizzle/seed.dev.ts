import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { customers, organizationMembers, organizations, users } from "./schema";

if (process.env.NODE_ENV === "production") throw new Error("O seed não pode ser executado em produção.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não está configurada.");

const db = drizzle(process.env.DATABASE_URL);
const demoOpenId = process.env.SEED_USER_OPEN_ID || "local-development-owner";

async function seed() {
  await db.insert(users).values({
    openId: demoOpenId,
    name: "Conta de desenvolvimento",
    email: "dev@hendersonlabs.local",
    loginMethod: "development",
    role: "admin",
  }).onDuplicateKeyUpdate({ set: { lastSignedIn: new Date() } });
  const user = (await db.select().from(users).where(eq(users.openId, demoOpenId)).limit(1))[0]!;
  let organization = (await db.select().from(organizations).where(eq(organizations.slug, "demo-henderson")).limit(1))[0];
  if (!organization) {
    const inserted = await db.insert(organizations).values({ name: "Academia Horizonte", slug: "demo-henderson", segment: "Academia" }).$returningId();
    organization = (await db.select().from(organizations).where(eq(organizations.id, inserted[0]!.id)).limit(1))[0]!;
  }
  await db.insert(organizationMembers).values({ organizationId: organization.id, userId: user.id, role: "owner" }).onDuplicateKeyUpdate({ set: { role: "owner" } });
  const count = await db.select({ id: customers.id }).from(customers).where(eq(customers.organizationId, organization.id)).limit(1);
  if (count.length) return console.log("Seed ignorado: já existem clientes de desenvolvimento.");
  const now = Date.now();
  await db.insert(customers).values([
    { organizationId: organization.id, name: "Ana Martins", phone: "11999990001", status: "active", pipelineStage: "recurring", lastPurchaseAt: new Date(now - 8 * 86400000), totalSpent: "1850", points: 240, loyaltyToken: nanoid(32), consentWhatsapp: true },
    { organizationId: organization.id, name: "João Alves", phone: "11999990002", status: "at_risk", pipelineStage: "contacted", lastPurchaseAt: new Date(now - 42 * 86400000), totalSpent: "980", points: 80, loyaltyToken: nanoid(32), consentWhatsapp: true },
    { organizationId: organization.id, name: "Carla Souza", phone: "11999990003", status: "inactive", pipelineStage: "interested", lastPurchaseAt: new Date(now - 78 * 86400000), totalSpent: "1420", points: 120, loyaltyToken: nanoid(32), consentWhatsapp: false },
  ]);
  console.log("Seed de desenvolvimento concluído.");
}

seed().catch(error => { console.error(error); process.exit(1); });
