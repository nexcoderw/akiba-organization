import styles from "./loading-state.module.css";

export type LoadingStatePhase =
  "session-check" | "mfa-verification" | "workspace" | "session-expired";

const copy: Record<LoadingStatePhase, { title: string; message: string }> = {
  "session-check": {
    title: "Checking your session",
    message: "Confirming your access…",
  },
  "mfa-verification": {
    title: "Verifying your sign-in",
    message: "Just a moment…",
  },
  workspace: {
    title: "Loading your workspace",
    message: "Almost there…",
  },
  "session-expired": {
    title: "Returning to sign in",
    message: "Your session has ended.",
  },
};

export function LoadingState({
  phase = "session-check",
}: {
  phase?: LoadingStatePhase;
}) {
  const { title, message } = copy[phase];

  return (
    <section
      className={styles.screen}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={styles.content}>
        <div className={styles.loader} aria-hidden="true">
          <span className={styles.halo} />
          <span className={styles.ringOuter} />
          <span className={styles.ringInner} />
          <span className={styles.mark}>a</span>
        </div>

        <div className={styles.copy}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.message}>{message}</p>
        </div>
      </div>
    </section>
  );
}
