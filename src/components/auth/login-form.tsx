"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/shared/button";
import { Form } from "@/components/shared/form";
import { Icon } from "@/components/shared/icon";
import { Input, type InputProps } from "@/components/shared/input";
import { OtpInput } from "@/components/shared/otp-input";
import { readSession, requestOwnerFlow } from "@/lib/auth/browser";
import { isRecord, validEnrollmentBody } from "@/lib/auth/contracts";
import { isInvitationToken } from "@/lib/auth/invitation-preview";
import styles from "./login-form.module.css";

export interface EnrollmentStart {
  nextStep: "register" | "sign_in";
  token: string;
  organizationName: string;
  invitedDisplayName: string;
}

function PasswordInput({
  id,
  name,
  ...props
}: Omit<InputProps, "type" | "icon" | "trailingAction">) {
  const [visible, setVisible] = useState(false);
  const field =
    name === "confirmPassword" ? "password confirmation" : "password";
  return (
    <Input
      {...props}
      id={id}
      name={name}
      type={visible ? "text" : "password"}
      icon={<Icon name="lock" />}
      trailingAction={
        <button
          type="button"
          className={styles.visibility}
          aria-label={`${visible ? "Hide" : "Show"} ${field}`}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((current) => !current)}
        >
          <Icon name={visible ? "eye-off" : "eye"} />
        </button>
      }
    />
  );
}

export function LoginForm({ invitation }: { invitation?: EnrollmentStart }) {
  const [emailChallenge, setEmailChallenge] = useState<string>();
  const [enrollmentAuthenticated, setEnrollmentAuthenticated] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [passwordProblem, setPasswordProblem] = useState<{
    field: "owner-password" | "owner-confirm-password";
    message: string;
  }>();
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
    setPasswordProblem(undefined);
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
        if (invitation.nextStep === "register") {
          if (!validEnrollmentBody("enrollmentPassword", { password })) {
            passwordIssue(
              "owner-password",
              "Use at least eight characters and avoid unsupported characters.",
            );
            return;
          }
          if (data.get("confirmPassword") !== password) {
            passwordIssue(
              "owner-confirm-password",
              "The passwords don’t match.",
            );
            return;
          }
        }
        await requestOwnerFlow(
          invitation.nextStep === "register" ? "register" : "existing",
          {
            challengeToken: invitation.token,
            password,
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

  function passwordIssue(
    field: "owner-password" | "owner-confirm-password",
    message: string,
  ) {
    setPasswordProblem({ field, message });
    requestAnimationFrame(() => document.getElementById(field)?.focus());
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
          {needsPassword && invitation && (
            <Input
              id="owner-name"
              label="Invited name"
              hint="This name comes from your invitation."
              value={invitation.invitedDisplayName}
              readOnly
            />
          )}
          {needsPassword && (
            <PasswordInput
              id="owner-password"
              name="password"
              label="Password"
              autoComplete={registering ? "new-password" : "current-password"}
              minLength={registering ? 8 : undefined}
              maxLength={4096}
              hint={registering ? "Use at least eight characters." : undefined}
              error={
                passwordProblem?.field === "owner-password"
                  ? passwordProblem.message
                  : undefined
              }
              onChange={() => setPasswordProblem(undefined)}
              required
            />
          )}
          {needsPassword && registering && (
            <PasswordInput
              id="owner-confirm-password"
              name="confirmPassword"
              label="Confirm password"
              autoComplete="new-password"
              maxLength={4096}
              error={
                passwordProblem?.field === "owner-confirm-password"
                  ? passwordProblem.message
                  : undefined
              }
              onChange={() => setPasswordProblem(undefined)}
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
