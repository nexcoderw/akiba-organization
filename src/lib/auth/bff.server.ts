import "server-only";

import { randomUUID } from "node:crypto";
import { backendRequest, boundedJson, getAuthConfig } from "./backend.server";
import {
  parseOwnerSession,
  safeProblem,
  type AuthOperation,
} from "./contracts";
import { csrfMatches } from "./csrf-policy";
import { browserOriginAllowed, ownerCookies } from "./policy";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function problem(status: number, operation: AuthOperation, body: unknown = {}) {
  const safe = safeProblem(status, body, operation);
  return Response.json(
    {
      type: "about:blank",
      title: safe.message,
      status,
      detail: safe.message,
      code: safe.code,
      requestId: safe.requestId ?? randomUUID(),
    },
    {
      status,
      headers: {
        ...privateHeaders,
        "Content-Type": "application/problem+json",
      },
    },
  );
}

export async function handle(operation: AuthOperation, request: Request) {
  if (operation !== "session" && operation !== "logout") {
    return problem(503, operation);
  }

  try {
    const config = getAuthConfig();
    if (
      !browserOriginAllowed(
        request.headers,
        config.adminOrigin,
        operation === "logout",
      )
    ) {
      return problem(403, operation);
    }

    const cookie = request.headers.get("cookie") ?? "";
    const incoming = ownerCookies(cookie, config.secure);
    if (operation === "session") {
      if (!incoming.header) return problem(401, operation);
      const result = await backendRequest(operation, incoming.header);
      if (result.status >= 400)
        return problem(result.status, operation, result.body);
      const session = result.status === 200 && parseOwnerSession(result.body);
      return session
        ? Response.json(session, { headers: privateHeaders })
        : problem(502, operation);
    }

    const csrf = request.headers.get("x-owner-csrf-token");
    if (!csrf || !csrfMatches(incoming.csrf, csrf))
      return problem(403, operation);
    if (request.body) {
      try {
        if ((await boundedJson(request, 1, true)) !== null)
          return problem(400, operation);
      } catch {
        return problem(400, operation);
      }
    }

    const result = await backendRequest(operation, incoming.header, csrf);
    if (result.status >= 400)
      return problem(result.status, operation, result.body);
    if (result.status !== 204) return problem(502, operation);
    const response = new Response(null, {
      status: 204,
      headers: privateHeaders,
    });
    for (const clearing of result.cookies) {
      response.headers.append("Set-Cookie", clearing);
    }
    return response;
  } catch {
    return problem(503, operation);
  }
}

export function login(request: Request) {
  return handle("login", request);
}

export function verify(request: Request) {
  return handle("verify", request);
}

export function session(request: Request) {
  return handle("session", request);
}

export function logout(request: Request) {
  return handle("logout", request);
}
