import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { backendRequest, getAuthConfig } from "./backend.server";
import { ownerCookieNames } from "./policy";
import {
  parseOwnerSession,
  safeProblem,
  type SessionResult,
} from "./contracts";

/** React.cache deduplicates one server render only; never persist a principal across requests. */
export const getSession = cache(async (): Promise<SessionResult> => {
  try {
    const config = getAuthConfig();
    const store = await cookies();
    if (!store.has(ownerCookieNames(config.secure).session))
      return { kind: "unauthenticated" };
    const result = await backendRequest("session", store.toString());
    if (result.status === 401) return { kind: "unauthenticated" };
    if (result.status === 403)
      return {
        kind: "denied",
        problem: safeProblem(403, result.body, "session"),
      };
    const session =
      result.status === 200 ? parseOwnerSession(result.body) : null;
    if (session)
      return Date.parse(session.expiresAt) > Date.now()
        ? { kind: "authenticated", session }
        : { kind: "unauthenticated" };
    return {
      kind: "unavailable",
      problem: safeProblem(
        result.status === 200 ? 502 : result.status,
        result.body,
        "session",
      ),
    };
  } catch {
    return { kind: "unavailable", problem: safeProblem(503, null, "session") };
  }
});
