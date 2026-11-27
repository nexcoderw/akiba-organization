import { ownerFlow } from "@/lib/auth/owner-flow.server";

export async function POST(
  request: Request,
  context: RouteContext<"/api/auth/owner-enrollment/[step]">,
) {
  const { step } = await context.params;
  return step === "login" || step === "verify"
    ? new Response(null, { status: 404 })
    : ownerFlow(step, request);
}
