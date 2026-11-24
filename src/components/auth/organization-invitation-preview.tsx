"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/shared/button";
import {
  invitationPreviewPath,
  invitationTokenFromFragment,
  parseInvitationPreview,
} from "@/lib/auth/invitation-preview";
import styles from "./organization-invitation-preview.module.css";

type PreviewState =
  | { kind: "ready" }
  | { kind: "invalid" }
  | { kind: "valid"; organizationName: string };

export function OrganizationInvitationPreview() {
  const [state, setState] = useState<PreviewState>({ kind: "ready" });
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

      token.current = null;
      setState({ kind: "valid", organizationName: preview.organizationName });
    } catch {
      if (!controller.signal.aborted) {
        setError("We couldn't look up your invitation. Please try again.");
      }
    } finally {
      pending.current = null;
    }
  }

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
          <p>
            Account setup is unavailable here. Contact the person who invited
            you for help.
          </p>
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
