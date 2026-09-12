import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { aiRouter } from "./routers/ai";
import { automationsRouter } from "./routers/automations";
import { campaignsRouter } from "./routers/campaigns";
import { customersRouter } from "./routers/customers";
import { loyaltyRouter } from "./routers/loyalty";
import { organizationRouter, reportsRouter } from "./routers/organization";
import { recoveryRouter } from "./routers/recovery";
import { tasksRouter } from "./routers/tasks";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  organization: organizationRouter,
  ai: aiRouter,
  customers: customersRouter,
  tasks: tasksRouter,
  automations: automationsRouter,
  recovery: recoveryRouter,
  loyalty: loyaltyRouter,
  campaigns: campaignsRouter,
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;
