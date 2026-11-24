import assert from "node:assert/strict";
import test from "node:test";
import {
  invitationTokenFromFragment,
  isInvitationToken,
  parseInvitationPreview,
} from "../src/lib/auth/invitation-preview.ts";

test("invitation links carry exactly one bounded opaque fragment token", () => {
  const token = "A".repeat(43);
  assert.equal(invitationTokenFromFragment(`#token=${token}`), token);
  for (const fragment of [
    "",
    `?token=${token}`,
    `#token=${token}&token=${token}`,
    `#token=${token}%0A`,
    `#token=${token}A`,
  ]) {
    assert.equal(invitationTokenFromFragment(fragment), null);
  }
  assert.equal(isInvitationToken(`${token.slice(1)}\n`), false);
});

test("invitation preview returns only the verified organization name", () => {
  assert.deepEqual(
    parseInvitationPreview({
      valid: true,
      organizationName: "Kigali Universe",
      session: "unexpected extra field",
    }),
    { valid: true, organizationName: "Kigali Universe" },
  );
  assert.equal(
    parseInvitationPreview({ valid: false, organizationName: "A" }),
    null,
  );
  assert.equal(
    parseInvitationPreview({ valid: true, organizationName: " " }),
    null,
  );
});
