import {
  isRecord,
  parseChallenge,
  parseVerification,
  safeProblem,
  sessionResult,
  needsCsrf,
  type AuthOperation,
  type SafeProblem,
} from "./contracts";
import { ownerCookieNames } from "./policy";

export class AuthRequestError extends Error {
  readonly problem: SafeProblem;
  constructor(problem: SafeProblem) {
    super(problem.message);
    this.name = "AuthRequestError";
    this.problem = problem;
  }
}

function csrfToken() {
  const name = ownerCookieNames(window.location.protocol === "https:").csrf;
  const matches = document.cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + "="));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{32,256}$/u.test(value) ? value : null;
}

const paths: Record<AuthOperation, string> = {
  login: "/api/auth/login",
  verify: "/api/auth/verify",
  session: "/api/auth/session",
  logout: "/api/auth/logout",
  enrollmentExchange: "/api/auth/enrollment/exchange",
  enrollmentStatus: "/api/auth/enrollment/status",
  enrollmentPassword: "/api/auth/enrollment/password",
  enrollmentSetup: "/api/auth/enrollment/setup",
  enrollmentComplete: "/api/auth/enrollment/complete",
  enrollmentCancel: "/api/auth/enrollment/cancel",
};

export async function authRequest(
  operation: AuthOperation,
  body?: unknown,
  signal?: AbortSignal,
) {
  const headers = new Headers({
    Accept: "application/json, application/problem+json",
  });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (needsCsrf(operation)) {
    const csrf = csrfToken();
    if (!csrf) {
      throw new AuthRequestError(
        operation !== "logout"
          ? safeProblem(401, { code: "AUTH_MFA_INVALID" }, operation)
          : {
              status: 403,
              code: "ACCESS_DENIED",
              message:
                "Sign-out couldn't be confirmed. Reload the page and try again.",
            },
      );
    }
    headers.set("x-owner-csrf-token", csrf);
  }
  let response: Response;
  try {
    response = await fetch(paths[operation], {
      method: operation === "session" ? "GET" : "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
    });
  } catch {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    throw new AuthRequestError({
      status: 0,
      code: "NETWORK_UNAVAILABLE",
      message:
        "We couldn't reach the service. Check your connection and try again.",
    });
  }
  const type = response.headers.get("content-type")?.split(";")[0].trim();
  let data: unknown = null;
  if (response.status !== 204) {
    try {
      if (type !== "application/json" && type !== "application/problem+json")
        throw new Error("Unexpected response.");
      const text = await response.text();
      if (text.length > 32768) throw new Error("Unexpected response.");
      data = JSON.parse(text);
    } catch {
      throw new AuthRequestError(safeProblem(502, null, operation));
    }
  }
  if (!response.ok) {
    if (response.status === 401 && operation === "session" && !signal?.aborted)
      window.dispatchEvent(new Event("akiba:session-expired"));
    throw new AuthRequestError(safeProblem(response.status, data, operation));
  }
  return { status: response.status, data };
}

export async function readSession(signal?: AbortSignal) {
  try {
    const response = await authRequest("session", undefined, signal);
    return sessionResult(response.status, response.data);
  } catch (error: unknown) {
    if (signal?.aborted) throw error;
    if (error instanceof AuthRequestError)
      return sessionResult(error.problem.status, error.problem);
    return sessionResult(503, null);
  }
}

export async function startLogin(email: string, password: string) {
  const { data } = await authRequest("login", { email, password });
  const result = parseChallenge(data);
  if (!result) throw new AuthRequestError(safeProblem(502, null, "login"));
  return result;
}

export async function verifyMfa(
  method: "totp" | "recovery_code",
  code: string,
) {
  const body =
    method === "totp"
      ? { method, totpCode: code }
      : { method, recoveryCode: code };
  const { data } = await authRequest("verify", body);
  const result = parseVerification(data);
  if (!result) throw new AuthRequestError(safeProblem(502, null, "verify"));
  return result;
}

export async function endSession() {
  await authRequest("logout");
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel("akiba-owner-session")
      : null;
  channel?.postMessage("signed-out");
  channel?.close();
}

export async function requestOwnerFlow(
  step:
    | "login"
    | "verify"
    | "begin"
    | "existing"
    | "register"
    | "send-code"
    | "accept",
  body: Record<string, string>,
): Promise<unknown> {
  const path =
    step === "login" || step === "verify"
      ? paths[step]
      : `/api/auth/owner-enrollment/${step}`;
  const headers = new Headers({ "Content-Type": "application/json" });
  if (step === "send-code" || step === "accept") {
    const csrf = csrfToken();
    if (!csrf)
      throw new Error(
        "Your enrollment session expired. Reopen your invitation.",
      );
    headers.set("x-owner-csrf-token", csrf);
  }
  const response = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(25000),
  });
  const data: unknown = await response.json().catch(() => null);
  if (response.ok) return data;
  if (response.status === 429)
    throw new Error("Wait a minute before requesting another code.");
  if (
    step === "login" &&
    isRecord(data) &&
    data.code === "OWNER_ACCOUNT_NOT_FOUND"
  )
    throw new Error("No organization owner account exists for that email.");
  if (response.status === 401 || response.status === 412) {
    if (step === "accept" || step === "verify")
      throw new Error(
        "The email code is invalid or expired. Check the latest email or start again.",
      );
    if (step === "login" || step === "existing")
      throw new Error("Check your email and password and try again.");
    throw new Error(
      "Your invitation is invalid or expired. Reopen the original link.",
    );
  }
  if (step === "register") {
    if (isRecord(data) && data.code === "PASSWORD_POLICY_VIOLATION") {
      throw new Error(
        "Choose a password of at least eight characters and avoid common or compromised passwords.",
      );
    }
    if (response.status === 409) {
      throw new Error("Account setup has changed. Reopen your invitation.");
    }
  }
  throw new Error("We couldn't complete this step. Please try again.");
}
