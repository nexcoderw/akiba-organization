export type MfaMethod = "totp" | "recovery_code" | "email_otp";

export interface OwnerSession {
  displayName: string;
  email: string;
  expiresAt: string;
}

export interface PlatformSession extends OwnerSession {
  permissions: string[];
}

export interface Challenge {
  status: "MFA_REQUIRED";
  nextStep: "VERIFY_MFA";
  expiresAt: string;
  methods: MfaMethod[];
}

export interface Verification {
  status: "authenticated" | "mfa_recovery_required";
  expiresAt: string;
}

export interface SafeProblem {
  status: number;
  code: string;
  message: string;
  requestId?: string;
}

export type SessionResult =
  | { kind: "authenticated"; session: OwnerSession }
  | { kind: "unauthenticated" }
  | { kind: "denied"; problem: SafeProblem }
  | { kind: "unavailable"; problem: SafeProblem };

export const AUTH_PATHS = {
  login: "/api/v1/platform/auth/login",
  verify: "/api/v1/platform/auth/mfa/verify",
  session: "/api/v1/platform/auth/me",
  logout: "/api/v1/platform/auth/logout",
} as const;

export const ENROLLMENT_PATHS = {
  enrollmentExchange: "/api/v1/platform/bootstrap/enrollment/exchange",
  enrollmentStatus: "/api/v1/platform/bootstrap/enrollment/status",
  enrollmentPassword: "/api/v1/platform/bootstrap/enrollment/password",
  enrollmentSetup: "/api/v1/platform/bootstrap/enrollment/setup",
  enrollmentComplete: "/api/v1/platform/bootstrap/enrollment/complete",
  enrollmentCancel: "/api/v1/platform/bootstrap/enrollment/cancel",
} as const;

export type AuthOperation =
  keyof typeof AUTH_PATHS | keyof typeof ENROLLMENT_PATHS;

export function isEnrollment(operation: AuthOperation): boolean {
  return Object.hasOwn(ENROLLMENT_PATHS, operation);
}

export function needsCsrf(operation: AuthOperation): boolean {
  return (
    operation === "verify" ||
    operation === "logout" ||
    (isEnrollment(operation) && operation !== "enrollmentExchange")
  );
}

export function validEnrollmentBody(
  operation: AuthOperation,
  body: unknown,
): boolean {
  if (!isEnrollment(operation) || !isRecord(body)) return false;
  const keys = Object.keys(body);
  if (operation === "enrollmentExchange")
    return (
      keys.length === 1 &&
      typeof body.token === "string" &&
      /^[A-Za-z0-9_-]{43}$/u.test(body.token)
    );
  if (operation === "enrollmentPassword")
    return (
      keys.length === 1 &&
      typeof body.password === "string" &&
      body.password.length <= 4096 &&
      Array.from(body.password.normalize("NFC")).length >= 8 &&
      Array.from(body.password.normalize("NFC")).length <= 1024 &&
      new TextEncoder().encode(body.password.normalize("NFC")).length <= 4096 &&
      !/[\p{Cc}\p{Cs}]/u.test(body.password)
    );
  if (operation === "enrollmentComplete")
    return (
      keys.length === 2 &&
      typeof body.code === "string" &&
      /^\d{6}$/u.test(body.code) &&
      typeof body.version === "number" &&
      Number.isSafeInteger(body.version) &&
      body.version >= 1 &&
      body.version <= 2147483647
    );
  return keys.length === 0;
}

export function parseEnrollmentState(
  value: unknown,
): { stage: "password" | "mfa"; expiresAt: string } | null {
  if (
    !isRecord(value) ||
    (value.stage !== "password" && value.stage !== "mfa") ||
    !validExpiry(value.expiresAt)
  )
    return null;
  return { stage: value.stage, expiresAt: value.expiresAt };
}

export function parseEnrollmentSetup(
  value: unknown,
): { secret: string; version: number } | null {
  if (
    !isRecord(value) ||
    typeof value.secret !== "string" ||
    !/^[A-Z2-7]{32}$/u.test(value.secret) ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1
  )
    return null;
  return { secret: value.secret, version: value.version };
}

export function parseEnrollmentComplete(
  value: unknown,
): { recoveryCodes: string[] } | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.recoveryCodes) ||
    value.recoveryCodes.length !== 10 ||
    !value.recoveryCodes.every(
      (code): code is string =>
        typeof code === "string" &&
        /^(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/u.test(code),
    ) ||
    new Set(value.recoveryCodes).size !== 10
  )
    return null;
  return { recoveryCodes: [...value.recoveryCodes] };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit;
}

function validExpiry(value: unknown): value is string {
  return shortText(value, 40) && Number.isFinite(Date.parse(value));
}

export function parseOwnerSession(value: unknown): OwnerSession | null {
  if (
    !isRecord(value) ||
    value.assurance !== "aal2" ||
    !shortText(value.userId, 100) ||
    !Array.isArray(value.organizations) ||
    value.organizations.length === 0 ||
    !shortText(value.displayName, 200) ||
    !shortText(value.email, 254) ||
    !validExpiry(value.expiresAt)
  ) {
    return null;
  }
  return {
    displayName: value.displayName,
    email: value.email,
    expiresAt: value.expiresAt,
  };
}

function strings(value: unknown, limit: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= limit &&
    value.every((item) => shortText(item, 150))
  );
}

export function parseSession(value: unknown): PlatformSession | null {
  if (
    !isRecord(value) ||
    value.authenticated !== true ||
    value.mfaVerified !== true ||
    !shortText(value.userId, 100) ||
    !shortText(value.platformStaffId, 100) ||
    !shortText(value.displayName, 200) ||
    !shortText(value.email, 254) ||
    !validExpiry(value.expiresAt) ||
    !strings(value.permissions, 500)
  )
    return null;
  return {
    displayName: value.displayName,
    email: value.email,
    expiresAt: value.expiresAt,
    permissions: value.permissions,
  };
}

export function parsePublicSession(value: unknown): OwnerSession | null {
  if (
    !isRecord(value) ||
    !shortText(value.displayName, 200) ||
    !shortText(value.email, 254) ||
    !validExpiry(value.expiresAt)
  )
    return null;
  return {
    displayName: value.displayName,
    email: value.email,
    expiresAt: value.expiresAt,
  };
}

export function parseChallenge(value: unknown): Challenge | null {
  if (
    !isRecord(value) ||
    value.status !== "MFA_REQUIRED" ||
    value.nextStep !== "VERIFY_MFA" ||
    !validExpiry(value.expiresAt) ||
    !Array.isArray(value.methods) ||
    value.methods.length === 0 ||
    value.methods.length > 3 ||
    !value.methods.every(
      (item): item is MfaMethod =>
        item === "totp" || item === "recovery_code" || item === "email_otp",
    )
  )
    return null;
  return {
    status: value.status,
    nextStep: value.nextStep,
    expiresAt: value.expiresAt,
    methods: [...value.methods],
  };
}

export function parseVerification(value: unknown): Verification | null {
  if (
    !isRecord(value) ||
    (value.status !== "authenticated" &&
      value.status !== "mfa_recovery_required") ||
    !validExpiry(value.expiresAt)
  )
    return null;
  return { status: value.status, expiresAt: value.expiresAt };
}

/** Only the existing account landing route is eligible; expand with verified route permissions. */
export function safeDestination(value: unknown): string {
  return value === "/" ? value : "/";
}

export function loginErrors(
  email: string,
  password: string,
): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {};
  if (!email.trim()) errors.email = "Enter your email address.";
  else if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())
  )
    errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Enter your password.";
  else if (
    password.length > 4096 ||
    new TextEncoder().encode(password).length > 4096 ||
    /\p{Cs}/u.test(password)
  ) {
    errors.password = "This password exceeds the supported sign-in limits.";
  }
  return errors;
}

export function validLoginBody(
  value: unknown,
): value is { email: string; password: string } {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    typeof value.email === "string" &&
    typeof value.password === "string" &&
    Object.keys(loginErrors(value.email, value.password)).length === 0
  );
}

export function validVerificationBody(
  value: unknown,
): value is
  | { method: "totp"; totpCode: string }
  | { method: "recovery_code"; recoveryCode: string } {
  if (!isRecord(value) || Object.keys(value).length !== 2) return false;
  if (value.method === "totp")
    return (
      typeof value.totpCode === "string" && /^\d{6}$/u.test(value.totpCode)
    );
  return (
    value.method === "recovery_code" &&
    typeof value.recoveryCode === "string" &&
    value.recoveryCode.length <= 64 &&
    /^(?:[A-Fa-f0-9]{4}-){7}[A-Fa-f0-9]{4}$/u.test(value.recoveryCode)
  );
}

export function safeProblem(
  status: number,
  body: unknown,
  operation: AuthOperation,
): SafeProblem {
  const source = isRecord(body) ? body : {};
  const allowedCodes = new Set([
    "VALIDATION_FAILED",
    "PASSWORD_POLICY_VIOLATION",
    "PLATFORM_BOOTSTRAP_ENROLLMENT_INVALID",
    "PLATFORM_BOOTSTRAP_ENROLLMENT_UNAVAILABLE",
    "BAD_REQUEST",
    "ACCESS_DENIED",
    "UNAUTHENTICATED",
    "RATE_LIMITED",
    "AUTH_INVALID_CREDENTIALS",
    "AUTH_SESSION_EXPIRED",
    "AUTH_MFA_REQUIRED",
    "AUTH_MFA_INVALID",
    "SERVICE_UNAVAILABLE",
    "INTERNAL_ERROR",
    "BAD_GATEWAY",
    "GATEWAY_TIMEOUT",
    "NETWORK_UNAVAILABLE",
    "PLATFORM_AUTHENTICATION_FAILED",
    "PLATFORM_SESSION_INVALID",
    "PLATFORM_MFA_VERIFICATION_FAILED",
    "PLATFORM_MFA_SETUP_REQUIRED",
    "PLATFORM_ORIGIN_REJECTED",
    "PLATFORM_CSRF_REJECTED",
    "PLATFORM_PERMISSION_DENIED",
    "PLATFORM_PERMISSION_REQUIRED",
    "PLATFORM_LOGIN_RATE_LIMITED",
    "PLATFORM_SESSION_UNAVAILABLE",
    "PLATFORM_LOGIN_UNAVAILABLE",
    "PLATFORM_MFA_UNAVAILABLE",
  ]);
  const code =
    typeof source.code === "string" && allowedCodes.has(source.code)
      ? source.code
      : status === 401
        ? "UNAUTHENTICATED"
        : status === 403
          ? "ACCESS_DENIED"
          : status === 429
            ? "RATE_LIMITED"
            : status === 400
              ? "VALIDATION_FAILED"
              : "SERVICE_UNAVAILABLE";
  const requestId =
    typeof source.requestId === "string" &&
    /^[a-zA-Z0-9_-]{1,80}$/u.test(source.requestId)
      ? source.requestId
      : undefined;
  let message = "The service is temporarily unavailable. Please try again.";
  if (status === 400 || status === 422)
    message = "Check your information and try again.";
  if (status === 401)
    message =
      operation === "login"
        ? "Unable to sign in with the provided credentials."
        : operation === "verify"
          ? "The code or sign-in request is invalid or has expired. Try a current code or start again."
          : "Your session has expired. Sign in again.";
  if (status === 403)
    message = "You don't have permission to perform this action.";
  if (status === 412)
    message = "Complete the required security verification before continuing.";
  if (status === 429)
    message = "Too many attempts. Please wait before trying again.";
  if (isEnrollment(operation) && status === 401)
    message =
      "The code or enrollment request is invalid or has expired. Use a current code, or ask your operator for a new enrollment email.";
  if (code === "PASSWORD_POLICY_VIOLATION")
    message =
      "Use at least 8 characters and avoid common or compromised passwords.";
  return { status, code, message, ...(requestId ? { requestId } : {}) };
}

export function sessionResult(status: number, body: unknown): SessionResult {
  if (status === 401) return { kind: "unauthenticated" };
  if (status === 403)
    return { kind: "denied", problem: safeProblem(status, body, "session") };
  const session = status === 200 ? parsePublicSession(body) : null;
  if (session)
    return Date.parse(session.expiresAt) > Date.now()
      ? { kind: "authenticated", session }
      : { kind: "unauthenticated" };
  return {
    kind: "unavailable",
    problem: safeProblem(status === 200 ? 502 : status, body, "session"),
  };
}
