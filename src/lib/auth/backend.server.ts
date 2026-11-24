import "server-only";

import { approvedOwnerCookieClears, authConfig, ownerCookies } from "./policy";

export function getAuthConfig() {
  return authConfig(
    process.env.AKIBA_ORGANIZATION_PORTAL_ORIGIN,
    process.env.AKIBA_API_ORIGIN,
    process.env.NODE_ENV === "production",
  );
}

export async function boundedJson(
  response: Pick<Response, "body">,
  maximum = 32768,
  allowEmpty = false,
): Promise<unknown> {
  if (!response.body) throw new Error("Missing response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 5000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) throw new Error("Response limit exceeded.");
      chunks.push(value);
    }
  } finally {
    clearTimeout(deadline);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (timedOut) throw new Error("Response deadline exceeded.");
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(joined);
  return allowEmpty && text.length === 0 ? null : JSON.parse(text);
}

export async function backendRequest(
  operation: "session" | "logout",
  cookie: string,
  csrf?: string,
) {
  const config = getAuthConfig();
  const incoming = ownerCookies(cookie, config.secure);
  const headers = new Headers({
    Accept: "application/json, application/problem+json",
    Origin: config.adminOrigin,
  });
  if (incoming.header) headers.set("Cookie", incoming.header);
  if (csrf) headers.set("x-owner-csrf-token", csrf);
  const response = await fetch(
    `${config.apiOrigin}/api/v1/owner/auth/${operation}`,
    {
      method: operation === "session" ? "GET" : "POST",
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    },
  );
  if (operation === "logout" && response.status === 204) {
    const cookies = approvedOwnerCookieClears(
      response.headers.getSetCookie(),
      config.secure,
    );
    return { status: 204, body: null, cookies };
  }
  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    .trim();
  if (
    contentType !== "application/json" &&
    contentType !== "application/problem+json"
  )
    throw new Error("Unexpected response.");
  return {
    status: response.status,
    body: await boundedJson(response),
    cookies: [],
  };
}
