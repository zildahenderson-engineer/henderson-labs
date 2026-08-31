import { TRPCError } from "@trpc/server";
import { getOrganizationForUser } from "../db";

export type OrganizationRole = "owner" | "manager" | "operator" | "viewer";

export const PLAN_LIMITS = {
  basic: { customers: 500, automations: 3, members: 2 },
  professional: { customers: 3000, automations: 10, members: 5 },
  premium: { customers: 10000, automations: 30, members: 15 },
  enterprise: { customers: Number.MAX_SAFE_INTEGER, automations: Number.MAX_SAFE_INTEGER, members: Number.MAX_SAFE_INTEGER },
} as const;

export async function organizationContext(user: { id: number; name: string | null; email: string | null }) {
  return getOrganizationForUser(user);
}

export function assertCanEdit(role: OrganizationRole) {
  if (role === "viewer") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil tem acesso somente para leitura." });
  }
}

export function assertCanManage(role: OrganizationRole) {
  if (role !== "owner" && role !== "manager") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Esta ação exige perfil de gestor ou proprietário." });
  }
}

export function assertOwner(role: OrganizationRole) {
  if (role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Esta ação exige o perfil de proprietário." });
  }
}
