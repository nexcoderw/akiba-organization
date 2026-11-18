export const invitationPreviewPath = "/api/auth/invitations/preview";

export function isInvitationToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === 43 &&
    /^[A-Za-z0-9_-]+$/u.test(value)
  );
}

export function invitationTokenFromFragment(fragment: string): string | null {
  if (!fragment.startsWith("#token=")) return null;
  const token = fragment.slice("#token=".length);
  return isInvitationToken(token) ? token : null;
}

export function parseInvitationPreview(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("valid" in value) ||
    value.valid !== true ||
    !("organizationName" in value) ||
    typeof value.organizationName !== "string" ||
    value.organizationName.trim().length === 0 ||
    [...value.organizationName].length > 160
  ) {
    return null;
  }

  return { valid: true, organizationName: value.organizationName };
}
