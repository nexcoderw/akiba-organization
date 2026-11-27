"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/shared/button";
import { requestOwnerFlow } from "@/lib/auth/browser";
import { isRecord } from "@/lib/auth/contracts";
import {
  invitationPreviewPath,
  invitationTokenFromFragment,
  isInvitationToken,
  parseInvitationPreview,
} from "@/lib/auth/invitation-preview";
import { LoginForm, type EnrollmentStart } from "./login-form";
import styles from "./organization-invitation-preview.module.css";

type PreviewState =
  | { kind: "ready" }
  | { kind: "invalid" }
  | { kind: "valid"; organizationName: string };

export function OrganizationInvitationPreview() {
  const [state, setState] = useState<PreviewState>({ kind: "ready" });
  const [enrollment, setEnrollment] = useState<EnrollmentStart>();
  const [error, setError] = useState<string>();
  const token = useRef<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const { hash, pathname } = window.location;
    if (hash) {
      token.current = invitationTokenFromFragment(hash);
      window.history.replaceState(null, "", pathname);
    }
    return () => pending.current?.abort();
  }, []);

  useEffect(() => {
    if (state.kind !== "ready") heading.current?.focus();
  }, [state.kind]);

  async function review() {
    if (pending.current) return;
    const proof = token.current;
    if (!proof) {
      setState({ kind: "invalid" });
      return;
    }

    setError(undefined);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const response = await fetch(invitationPreviewPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: proof }),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      if (controller.signal.aborted) return;
      if (response.status === 401) {
        token.current = null;
        setState({ kind: "invalid" });
        return;
      }
      if (response.status === 429) {
        setError("Too many attempts. Wait a moment and try again.");
        return;
      }
      if (!response.ok) throw new Error("Invitation preview unavailable.");

      const preview = parseInvitationPreview(await response.json());
      if (controller.signal.aborted) return;
      if (!preview) throw new Error("Invalid invitation preview response.");

      setState({ kind: "valid", organizationName: preview.organizationName });
    } catch {
      if (!controller.signal.aborted) {
        setError("We couldn't look up your invitation. Please try again.");
      }
    } finally {
      pending.current = null;
    }
  }

  async function begin() {
    const proof = token.current;
    if (!proof) return;
    setError(undefined);
    try {
      const result = await requestOwnerFlow("begin", {
        invitationToken: proof,
      });
      if (
        !isRecord(result) ||
        (result.nextStep !== "register" && result.nextStep !== "sign_in") ||
        !isInvitationToken(result.token) ||
        typeof result.organizationName !== "string"
      ) {
        throw new Error(
          "We couldn't start enrollment. Reopen your invitation.",
        );
      }
      token.current = null;
      setEnrollment({
        nextStep: result.nextStep,
        token: result.token,
        organizationName: result.organizationName,
      });
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "We couldn't start enrollment.",
      );
    }
  }

  if (enrollment) return <LoginForm invitation={enrollment} />;

  return (
    <div className={styles.panel}>
      <h1 ref={heading} tabIndex={-1} className={styles.title}>
        {state.kind === "valid"
          ? "Invitation confirmed"
          : state.kind === "invalid"
            ? "Invitation unavailable"
            : "Review your invitation"}
      </h1>
      {state.kind === "valid" && (
        <>
          <p>You’ve been invited to manage {state.organizationName}.</p>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <Button onClick={begin} loadingLabel="Starting setup…">
            Continue to setup
          </Button>
        </>
      )}
      {state.kind === "invalid" && (
        <p>
          Open the original invitation link from your email. If it still fails,
          contact the person who invited you.
        </p>
      )}
      {state.kind === "ready" && (
        <>
          <p>Check which organization invited you to Akiba.</p>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <Button onClick={review} loadingLabel="Checking invitation…">
            Check invitation
          </Button>
        </>
      )}
    </div>
  );
}
