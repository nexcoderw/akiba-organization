"use client";

import { Button } from "@/components/shared/button";
import { Icon } from "@/components/shared/icon";
import styles from "./auth-notice.module.css";

export function AuthNotice({
  title = "We couldn't verify your session",
  message = "The service is temporarily unavailable. Check your connection and try again.",
  requestId,
  onRetryAction,
}: {
  title?: string;
  message?: string;
  requestId?: string;
  onRetryAction?: () => void | Promise<void>;
}) {
  return (
    <section
      className={styles.notice}
      aria-labelledby="session-notice-title"
      data-auth-notice
    >
      <span className={styles.icon}>
        <Icon name="warning" />
      </span>
      <h1 id="session-notice-title">{title}</h1>
      <p role="status">{message}</p>
      <Button
        variant="secondary"
        onClick={onRetryAction ?? (() => window.location.reload())}
      >
        Try again
      </Button>
      {requestId && <small>Reference: {requestId}</small>}
    </section>
  );
}
