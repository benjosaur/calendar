import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

/** Fields the runner may patch onto a job. Mirrors `callbackPatch` in codegen.ts. */
type CallbackPatch = {
  status?: "running" | "pushed" | "no_changes" | "error";
  summary?: string;
  runUrl?: string;
  commitSha?: string;
  error?: string;
};

/** Constant-time-ish bearer check against the shared CI secret. */
function authorized(req: Request): boolean {
  const secret = process.env.CODEGEN_CALLBACK_SECRET;
  if (!secret) return false;
  const header = req.headers.get("Authorization");
  return header === `Bearer ${secret}`;
}

// Progress callbacks from the GitHub Actions runner. The runner POSTs
// { jobId, status?, summary?, prUrl?, ... } as it advances through the run.
http.route({
  path: "/codegen/callback",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

    const { jobId, ...patch } = (await req.json()) as {
      jobId?: string;
    } & CallbackPatch;
    if (!jobId) return new Response("Missing jobId", { status: 400 });

    // The mutation's validator is the real boundary: it rejects any field not
    // in callbackPatch and confirms the id refers to a real codegenJobs row.
    await ctx.runMutation(internal.codegen.patch, {
      jobId: jobId as Id<"codegenJobs">,
      patch,
    });
    return new Response("ok", { status: 200 });
  }),
});

// Post-merge deployment marker, used by the frontend's stale-tab check.
http.route({
  path: "/codegen/deployed",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

    const { sha, deployedAt } = (await req.json()) as {
      sha?: string;
      deployedAt?: number;
    };
    if (!sha) return new Response("Missing sha", { status: 400 });

    await ctx.runMutation(internal.codegen.recordDeployment, {
      sha,
      deployedAt: deployedAt ?? 0,
    });
    return new Response("ok", { status: 200 });
  }),
});

export default http;
