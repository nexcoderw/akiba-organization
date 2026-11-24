"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/shared/button";
import { Icon } from "@/components/shared/icon";
import styles from "./auth-notice.module.css";

type AuthNoticeProps = {
  title?: string;
  message?: string;
  requestId?: string;
  onRetryAction?: () => void | Promise<void>;
  retryable?: boolean;
};

export function AuthNotice({
  title = "We couldn't verify your session",
  message = "The service is temporarily unavailable. Check your connection and try again.",
  requestId,
  onRetryAction,
  retryable = true,
}: AuthNoticeProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the "Copied" timer if the component unmounts mid-countdown
  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  async function handleRetry() {
    if (isRetrying) return;
    setIsRetrying(true);

    // No custom handler: a full reload is the retry, so keep the spinner until it happens
    if (!onRetryAction) {
      window.location.reload();
      return;
    }

    try {
      await onRetryAction();
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleCopy() {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, permissions); fail quietly
    }
  }

  return (
    <section
      className={styles.notice}
      aria-labelledby="session-notice-title"
      data-auth-notice
    >
      <span className={styles.icon} aria-hidden="true">
        <Icon name="warning" />
      </span>

      <div className={styles.content}>
        <h1 id="session-notice-title" className={styles.title}>
          {title}
        </h1>
        <p role="status" className={styles.message}>
          {message}
        </p>
      </div>

      {(retryable || requestId) && (
        <div className={styles.footer}>
          {retryable && (
            <Button
              variant="secondary"
              onClick={handleRetry}
              disabled={isRetrying}
              aria-busy={isRetrying}
            >
              <span className={styles.buttonLabel}>
                {isRetrying && (
                  <span className={styles.spinner} aria-hidden="true" />
                )}
                {isRetrying ? "Trying again" : "Try again"}
              </span>
            </Button>
          )}

          {requestId && (
            <div className={styles.reference}>
              <small className={styles.referenceText}>
                Reference: {requestId}
              </small>
              <button
                type="button"
                className={styles.copy}
                onClick={handleCopy}
                aria-label={
                  copied ? "Reference copied" : "Copy reference to clipboard"
                }
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
