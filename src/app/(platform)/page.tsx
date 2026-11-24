import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthNotice } from "@/components/auth/auth-notice";
import { AuthScreen } from "@/components/auth/auth-screen";
import { getSession } from "@/lib/auth/session.server";
import { LogoutButton } from "@/components/auth/logout-button";
import { Icon } from "@/components/shared/icon";
import { LoadingState } from "@/components/shared/loading-state";
import styles from "./page.module.css";

// The workspace may redirect after checking the request's organization session.
export const instant = false;

async function AccountLanding() {
  const result = await getSession();
  if (result.kind === "unauthenticated") redirect("/login?expired=1&next=%2F");
  if (result.kind === "denied" || result.kind === "unavailable") {
    return (
      <AuthScreen>
        <AuthNotice
          title={result.kind === "denied" ? "Access unavailable" : undefined}
          message={result.problem.message}
          requestId={result.problem.requestId}
        />
      </AuthScreen>
    );
  }
  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <Link
          href="/"
          prefetch={false}
          className={styles.brand}
          aria-label="Akiba workspace"
        >
          akiba.
        </Link>
        <LogoutButton />
      </header>
      <section className={styles.welcome}>
        <div className={styles.status}>
          <Icon name="check" /> Verified organization session
        </div>
        <h1>Welcome back, {result.session.displayName}.</h1>
        <p>You&apos;re signed in to the Akiba Organization Portal.</p>
        <p className={styles.account}>{result.session.email}</p>
        <div className={styles.note}>
          <Icon name="lock" />
          <p>Your session is tied to your organization access.</p>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingState phase="workspace" />}>
      <AccountLanding />
    </Suspense>
  );
}
