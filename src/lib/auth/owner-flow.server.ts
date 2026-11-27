import "server-only";

import { boundedJson, getAuthConfig } from "./backend.server";
import { isRecord, validLoginBody } from "./contracts";
import { csrfMatches } from "./csrf-policy";
import { isInvitationToken } from "./invitation-preview";
import {
  approvedOwnerCookieClears,
  approvedOwnerSessionCookies,
  browserOriginAllowed,
  ownerCookies,
} from "./policy";

const paths = {
  login: "/owner/auth/login",
  verify: "/owner/auth/email-otp/verify",
  begin: "/owner-enrollment/challenges",
  existing: "/owner/auth/verify",
  register: "/owner-enrollment/registrations",
  "send-code": "/owner-enrollment/email-otp",
  accept: "/owner-enrollment/acceptances",
} as const;

const headers = { "Cache-Control": "private, no-store, max-age=0" };

function failed(status: number, code?: string) {
  return Response.json({ code }, { status, headers });
}

function validInput(step: keyof typeof paths, input: unknown): boolean {
  if (step === "login") return validLoginBody(input);
  if (!isRecord(input)) return false;
  const size = Object.keys(input).length;
  if (step === "begin")
    return size === 1 && isInvitationToken(input.invitationToken);
  if (step === "send-code") return size === 0;
  if (step === "verify" || step === "accept") {
    const validCode =
      typeof input.code === "string" && /^[0-9]{6}$/u.test(input.code);
    return step === "verify"
      ? size === 2 && validCode && isInvitationToken(input.token)
      : size === 3 &&
          validCode &&
          isInvitationToken(input.challengeToken) &&
          isInvitationToken(input.emailOtpToken);
  }
  return (
    isInvitationToken(input.challengeToken) &&
    typeof input.password === "string" &&
    input.password.length > 0 &&
    input.password.length <= 4096 &&
    size === 2
  );
}

export async function ownerFlow(operation: string, request: Request) {
  if (!Object.hasOwn(paths, operation)) return failed(404);
  const step = operation as keyof typeof paths;
  try {
    const config = getAuthConfig();
    if (!browserOriginAllowed(request.headers, config.adminOrigin, true))
      return failed(403);
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      return failed(415);
    const input = await boundedJson(request, 32768).catch(() => null);
    if (!validInput(step, input)) return failed(400);

    const upstreamHeaders = new Headers({
      Accept: "application/json, application/problem+json",
      "Content-Type": "application/json",
      Origin: config.adminOrigin,
    });
    if (step === "send-code" || step === "accept") {
      const cookie = ownerCookies(
        request.headers.get("cookie") ?? "",
        config.secure,
      );
      const csrf = request.headers.get("x-owner-csrf-token");
      if (!csrf || !csrfMatches(cookie.csrf, csrf)) return failed(403);
      upstreamHeaders.set("Cookie", cookie.header);
      upstreamHeaders.set("x-owner-csrf-token", csrf);
    }

    const upstream = await fetch(`${config.apiOrigin}/api/v1${paths[step]}`, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: upstreamHeaders,
      body: JSON.stringify(input),
    });
    const responseType = upstream.headers
      .get("content-type")
      ?.split(";")[0]
      .trim();
    if (
      responseType !== "application/json" &&
      responseType !== "application/problem+json"
    ) {
      await upstream.body?.cancel();
      return failed(502);
    }
    const body = await boundedJson(upstream, 8192).catch(() => null);
    if (!upstream.ok)
      return failed(
        upstream.status,
        isRecord(body) &&
          ((step === "login" && body.code === "OWNER_ACCOUNT_NOT_FOUND") ||
            (step === "register" && body.code === "PASSWORD_POLICY_VIOLATION"))
          ? body.code
          : undefined,
      );
    if (!isRecord(body)) return failed(502);

    if (step === "begin") {
      if (
        (body.nextStep !== "register" && body.nextStep !== "sign_in") ||
        !isInvitationToken(body.challengeToken) ||
        typeof body.organizationName !== "string" ||
        body.organizationName.length > 320 ||
        typeof body.invitedDisplayName !== "string" ||
        !body.invitedDisplayName.trim() ||
        Array.from(body.invitedDisplayName).length > 160
      )
        return failed(502);
      return Response.json(
        {
          nextStep: body.nextStep,
          token: body.challengeToken,
          organizationName: body.organizationName,
          invitedDisplayName: body.invitedDisplayName,
        },
        { headers },
      );
    }

    if (step === "login" || step === "send-code") {
      if (
        body.status !== "email_otp_required" ||
        !isInvitationToken(body.token) ||
        typeof body.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(body.expiresAt))
      )
        return failed(502);
      return Response.json(
        { token: body.token, expiresAt: body.expiresAt },
        { headers },
      );
    }

    const expected =
      step === "verify"
        ? "authenticated"
        : step === "accept"
          ? "accepted"
          : "verified";
    if (body.status !== expected) return failed(502);
    const cookies =
      step === "accept"
        ? approvedOwnerCookieClears(
            upstream.headers.getSetCookie(),
            config.secure,
          )
        : approvedOwnerSessionCookies(
            upstream.headers.getSetCookie(),
            config.secure,
          );
    const response = Response.json({ status: expected }, { headers });
    for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
    return response;
  } catch {
    return failed(503);
  }
}
