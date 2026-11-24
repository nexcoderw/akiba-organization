export interface AuthConfig {
  adminOrigin: string;
  apiOrigin: string;
  secure: boolean;
}

export function authConfig(
  admin: string | undefined,
  api: string | undefined,
  production: boolean,
): AuthConfig {
  function origin(value: string | undefined) {
    if (!value) throw new Error("Authentication configuration is unavailable.");
    const url = new URL(value);
    if (
      url.origin !== value ||
      url.username ||
      url.password ||
      url.hostname.endsWith(".") ||
      !["http:", "https:"].includes(url.protocol) ||
      (production && url.protocol !== "https:") ||
      (url.protocol === "http:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    ) {
      throw new Error("Authentication configuration is unavailable.");
    }
    return url;
  }
  const adminUrl = origin(admin);
  const apiUrl = origin(api);
  if (adminUrl.origin === apiUrl.origin)
    throw new Error(
      "Authentication upstream must be distinct from the frontend server.",
    );
  return {
    adminOrigin: adminUrl.origin,
    apiOrigin: apiUrl.origin,
    secure: adminUrl.protocol === "https:",
  };
}

export function cookieNames(secure: boolean) {
  const prefix = secure ? "__Host-" : "";
  return {
    session: `${prefix}akiba-platform-session`,
    challenge: `${prefix}akiba-platform-challenge`,
    csrf: `${prefix}akiba-platform-csrf`,
    stepUp: `${prefix}akiba-platform-step-up`,
  };
}

export function ownerCookieNames(secure: boolean) {
  const prefix = secure ? "__Host-" : "";
  return {
    session: `${prefix}akiba-owner-session`,
    csrf: `${prefix}akiba-owner-csrf`,
  };
}

export function browserOriginAllowed(
  headers: Headers,
  expected: string,
  mutation: boolean,
): boolean {
  const origin = headers.get("origin");
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  if (origin !== null) return origin === expected;
  return !mutation && site === "same-origin";
}

/** Forward only canonical platform cookies; duplicates and malformed values fail closed. */
export function platformCookies(
  header: string,
  secure: boolean,
): { header: string; csrf?: string } {
  return readCookies(header, cookieNames(secure));
}

export function ownerCookies(header: string, secure: boolean) {
  return readCookies(header, ownerCookieNames(secure));
}

function readCookies(
  header: string,
  names: { session: string; csrf: string },
): { header: string; csrf?: string } {
  if (header.length > 16384) throw new Error("Invalid authentication cookies.");
  const allowed = new Set(Object.values(names));
  const seen = new Set<string>();
  const pairs: string[] = [];
  let csrf: string | undefined;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    const name = part.slice(0, at).trim();
    if (at < 0 || !allowed.has(name)) continue;
    const value = part.slice(at + 1).trim();
    if (
      seen.has(name) ||
      value.length > 340 ||
      !/^[A-Za-z0-9_.-]*$/u.test(value)
    )
      throw new Error("Invalid authentication cookies.");
    seen.add(name);
    pairs.push(`${name}=${value}`);
    if (name === names.csrf) csrf = value;
  }
  return { header: pairs.join("; "), csrf };
}

export function approvedSetCookies(
  values: string[],
  secure: boolean,
): string[] {
  return validateSetCookies(values, secure, cookieNames(secure));
}

export function approvedOwnerCookieClears(values: string[], secure: boolean) {
  if (values.length !== 2) {
    throw new Error("Invalid owner cookie clearing.");
  }
  return validateSetCookies(values, secure, ownerCookieNames(secure), true);
}

function validateSetCookies(
  values: string[],
  secure: boolean,
  names: { session: string; csrf: string; challenge?: string; stepUp?: string },
  clearOnly = false,
) {
  if (values.length > 4) throw new Error("Invalid upstream cookies.");
  const allowed = new Set(Object.values(names));
  const seen = new Set<string>();
  return values.map((cookie) => {
    if (cookie.length > 1200 || /[\r\n]/u.test(cookie))
      throw new Error("Invalid upstream cookie.");
    const parts = cookie.split(";").map((part) => part.trim());
    const at = parts[0].indexOf("=");
    const name = parts[0].slice(0, at);
    const value = parts[0].slice(at + 1);
    if (
      at < 1 ||
      !allowed.has(name) ||
      seen.has(name) ||
      (clearOnly && value !== "") ||
      value.length > 340 ||
      !/^[A-Za-z0-9_.-]*$/u.test(value)
    )
      throw new Error("Invalid upstream cookie.");
    seen.add(name);
    const attributes = new Map<string, string>();
    for (const part of parts.slice(1)) {
      const [key, ...rest] = part.split("=");
      const attr = key.toLowerCase();
      if (
        attributes.has(attr) ||
        ![
          "path",
          "expires",
          "secure",
          "httponly",
          "samesite",
          "max-age",
        ].includes(attr)
      )
        throw new Error("Invalid upstream cookie.");
      attributes.set(attr, rest.join("="));
    }
    if (
      attributes.get("path") !== "/" ||
      attributes.get("samesite")?.toLowerCase() !== "strict" ||
      attributes.has("secure") !== secure ||
      attributes.has("httponly") !== (name !== names.csrf) ||
      !attributes.has("expires") ||
      !Number.isFinite(Date.parse(attributes.get("expires") ?? "")) ||
      (clearOnly && Number(attributes.get("max-age") ?? 0) > 0) ||
      (attributes.has("max-age") &&
        !/^-?\d+$/u.test(attributes.get("max-age") ?? ""))
    )
      throw new Error("Invalid upstream cookie.");
    if (value) {
      const proof = name === names.challenge || name === names.stepUp;
      if (
        !(
          proof
            ? /^v1\.[A-Za-z0-9_-]{32,256}\.[a-f0-9]{64}$/u
            : /^[A-Za-z0-9_-]{32,256}$/u
        ).test(value)
      )
        throw new Error("Invalid upstream cookie.");
    } else if (Date.parse(attributes.get("expires") ?? "") > Date.now())
      throw new Error("Invalid cookie clearing.");
    return cookie;
  });
}
