"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/shared/button";
import { Form } from "@/components/shared/form";
import { Input } from "@/components/shared/input";
import { OtpInput } from "@/components/shared/otp-input";
import { readSession, requestOwnerFlow } from "@/lib/auth/browser";
import { isRecord } from "@/lib/auth/contracts";
import { isInvitationToken } from "@/lib/auth/invitation-preview";
import styles from "./login-form.module.css";

export interface EnrollmentStart {
  nextStep: "register" | "sign_in";
  token: string;
  organizationName: string;
}

export function LoginForm({ invitation }: { invitation?: EnrollmentStart }) {
  const [emailChallenge, setEmailChallenge] = useState<string>();
  const [enrollmentAuthenticated, setEnrollmentAuthenticated] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const codeRequested = emailChallenge !== undefined;

  useEffect(() => {
    if (codeRequested || accepted) heading.current?.focus();
  }, [accepted, codeRequested]);

  function showError(value: unknown) {
    setError(
      value instanceof Error
        ? value.message
        : "We couldn't complete this step.",
    );
  }

  async function submit(data: FormData) {
    setError(undefined);
    try {
      if (emailChallenge) {
        if (invitation) {
          await requestOwnerFlow("accept", {
            challengeToken: invitation.token,
            emailOtpToken: emailChallenge,
            code,
          });
          setCode("");
          setEmailChallenge(undefined);
          setAccepted(true);
          return;
        }
        await requestOwnerFlow("verify", { token: emailChallenge, code });
        if ((await readSession()).kind !== "authenticated")
          throw new Error(
            "Your session could not be confirmed. Start sign-in again.",
          );
        window.location.replace("/");
        return;
      }

      const password = String(data.get("password") ?? "");
      if (invitation && !enrollmentAuthenticated) {
        await requestOwnerFlow(
          invitation.nextStep === "register" ? "register" : "existing",
          {
            challengeToken: invitation.token,
            password,
            ...(invitation.nextStep === "register"
              ? { displayName: String(data.get("displayName") ?? "") }
              : {}),
          },
        );
        setEnrollmentAuthenticated(true);
      }

      const challenge = invitation
        ? await requestOwnerFlow("send-code", {})
        : await requestOwnerFlow("login", {
            email: String(data.get("email") ?? ""),
            password,
          });
      if (!isRecord(challenge) || !isInvitationToken(challenge.token))
        throw new Error("We couldn't confirm that a code was sent.");
      setCode("");
      setEmailChallenge(challenge.token);
    } catch (value) {
      setCode("");
      showError(value);
    }
  }

  const registering = invitation?.nextStep === "register";
  const needsPassword = !emailChallenge && !enrollmentAuthenticated;
  const title = accepted
    ? "Invitation accepted"
    : emailChallenge
      ? "Enter your email code"
      : invitation
        ? "Set up organization access"
        : "Sign in to your organization";

  return (
    <section className={styles.login}>
      <header className={styles.header}>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {accepted ? (
          <p>Sign in once {invitation?.organizationName} is active.</p>
        ) : emailChallenge ? (
          <p>
            Enter the six-digit code we sent to your email. It expires within
            five minutes.
          </p>
        ) : invitation ? (
          <p>Complete setup for {invitation.organizationName}.</p>
        ) : (
          <p>Use your organization email and password.</p>
        )}
      </header>
      {error && (
        <p role="alert" className={styles.problem}>
          {error}
        </p>
      )}
      {accepted ? (
        <Button onClick={() => window.location.assign("/login")}>
          Go to sign-in
        </Button>
      ) : (
        <Form onSubmitAction={submit} className={styles.form}>
          {needsPassword && !invitation && (
            <Input
              id="owner-email"
              name="email"
              label="Email"
              type="email"
              autoComplete="username"
              maxLength={254}
              required
            />
          )}
          {needsPassword && registering && (
            <Input
              id="owner-name"
              name="displayName"
              label="Full name"
              autoComplete="name"
              maxLength={160}
              required
            />
          )}
          {needsPassword && (
            <Input
              id="owner-password"
              name="password"
              label="Password"
              type="password"
              autoComplete={registering ? "new-password" : "current-password"}
              minLength={registering ? 8 : undefined}
              maxLength={4096}
              required
            />
          )}
          {emailChallenge && (
            <OtpInput
              id="owner-code"
              label="Email code"
              name="code"
              value={code}
              onValueChange={setCode}
              autoSubmit={false}
              required
            />
          )}
          <Button type="submit" disabled={codeRequested && code.length !== 6}>
            {emailChallenge ? "Verify email code" : "Send email code"}
          </Button>
          {emailChallenge && (
            <Button
              variant="secondary"
              onClick={() => {
                setEmailChallenge(undefined);
                setCode("");
                setError(undefined);
              }}
            >
              {invitation ? "Request a new code" : "Back to sign-in"}
            </Button>
          )}
        </Form>
      )}
    </section>
  );
}
