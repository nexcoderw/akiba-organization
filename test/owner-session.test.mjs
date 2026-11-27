import assert from "node:assert/strict";
import test from "node:test";
import { parseOwnerSession } from "../src/lib/auth/contracts.ts";
import {
  approvedOwnerCookieClears,
  approvedOwnerSessionCookies,
  ownerCookieNames,
  ownerCookies,
} from "../src/lib/auth/policy.ts";

test("organization requests forward owner cookies only", () => {
  const token = "t".repeat(43);
  for (const secure of [false, true]) {
    const { session, csrf } = ownerCookieNames(secure);
    const prefix = secure ? "__Host-" : "";
    const platform = [
      `${prefix}akiba-platform-session=${token}`,
      `${prefix}akiba-platform-challenge=${token}`,
    ].join("; ");
    const owner = `${session}=${token}.${token}; ${csrf}=${token}`;
    const filtered = ownerCookies(platform, secure);
    assert.equal(filtered.header, "");
    assert.equal(filtered.csrf, undefined);
    assert.deepEqual(ownerCookies(`${platform}; ${owner}`, secure), {
      header: owner,
      csrf: token,
    });
  }
});

test("organization logout accepts only clearing its two cookies", () => {
  const { session, csrf } = ownerCookieNames(true);
  const attributes =
    "; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Strict";
  const clears = [
    `${session}=${attributes}; HttpOnly`,
    `${csrf}=${attributes}`,
  ];
  assert.deepEqual(approvedOwnerCookieClears(clears, true), clears);
  assert.throws(() =>
    approvedOwnerCookieClears(
      [clears[0].replace("owner-session", "platform-session"), clears[1]],
      true,
    ),
  );
  assert.throws(() =>
    approvedOwnerCookieClears([clears[0], `${clears[1]}; Max-Age=3600`], true),
  );
});

test("organization sessions require owner assurance and membership", () => {
  const session = {
    displayName: "Organization Owner",
    email: "owner@example.com",
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
  const owner = { ...session, userId: "owner", organizations: [{ id: "org" }] };
  assert.equal(parseOwnerSession({ ...owner, assurance: "aal1" }), null);
  assert.equal(parseOwnerSession({ ...owner, mfaVerified: true }), null);
  assert.equal(
    parseOwnerSession({ ...owner, assurance: "aal2", organizations: [] }),
    null,
  );
  assert.deepEqual(parseOwnerSession({ ...owner, assurance: "aal2" }), session);
  assert.deepEqual(
    parseOwnerSession({ ...owner, assurance: "password_email_otp" }),
    session,
  );
});

test("organization accepts only a sealed owner cookie and its CSRF companion", () => {
  const { session, csrf } = ownerCookieNames(true);
  const token = "a".repeat(43);
  const attributes =
    "; Path=/; Expires=Fri, 01 Jan 2100 00:00:00 GMT; Secure; SameSite=Strict";
  const cookies = [
    `${session}=${token}.${token}${attributes}; HttpOnly`,
    `${csrf}=${token}${attributes}`,
  ];
  assert.deepEqual(approvedOwnerSessionCookies(cookies, true), cookies);
  assert.throws(() =>
    approvedOwnerSessionCookies(
      [cookies[0].replace("owner-session", "platform-session"), cookies[1]],
      true,
    ),
  );
});
