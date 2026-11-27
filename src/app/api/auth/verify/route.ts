import { ownerFlow } from "@/lib/auth/owner-flow.server";

export function POST(request: Request) {
  return ownerFlow("verify", request);
}
