"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { readSession } from "@/lib/auth/browser";
import {
  safeDestination,
  safeProblem,
  type OwnerSession,
  type SessionResult,
} from "@/lib/auth/contracts";
import { LoadingState } from "@/components/shared/loading-state";
import { AuthNotice } from "./auth-notice";
import styles from "./session-provider.module.css";

const SessionContext = createContext<OwnerSession | null>(null);
type State = { path: string; result: SessionResult | { kind: "checking" } };
const CHECKING = { kind: "checking" } as const;

interface RequestLifecycle {
  generation: number;
  controller: AbortController | null;
}

export function SessionProvider({
  initialSession,
  children,
}: {
  initialSession: OwnerSession;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [state, setState] = useState<State>({
    path: pathname,
    result: { kind: "authenticated", session: initialSession },
  });
  const requests = useRef<RequestLifecycle>({
    generation: 0,
    controller: null,
  });

  const check = useCallback(() => {
    const lifecycle = requests.current;
    const current = ++lifecycle.generation;
    lifecycle.controller?.abort();
    const controller = new AbortController();
    lifecycle.controller = controller;
    // State changes follow the external request's completion, never effect setup.
    return readSession(controller.signal)
      .then((result) => {
        if (controller.signal.aborted || lifecycle.generation !== current)
          return;
        if (
          result.kind === "authenticated" &&
          result.session.email !== initialSession.email
        ) {
          window.location.reload();
          return;
        }
        setState({ path: pathname, result });
      })
      .catch(() => {
        if (!controller.signal.aborted && lifecycle.generation === current) {
          setState({
            path: pathname,
            result: {
              kind: "unavailable",
              problem: safeProblem(503, null, "session"),
            },
          });
        }
      })
      .finally(() => {
        if (lifecycle.controller === controller) lifecycle.controller = null;
      });
  }, [initialSession.email, pathname]);

  const refresh = useCallback(async () => {
    const lifecycle = requests.current;
    if (lifecycle.controller && !lifecycle.controller.signal.aborted) return;
    setState({ path: pathname, result: { kind: "checking" } });
    await check();
  }, [check, pathname]);

  useEffect(() => {
    if (state.path !== pathname) void check();
  }, [check, pathname, state.path]);

  useEffect(() => {
    const lifecycle = requests.current;
    let lastChecked = performance.now();
    function revalidate() {
      if (document.hidden) return;
      // Focus and visibility can fire together. Keep the verified page mounted
      // while a single background request checks the live session.
      if (lifecycle.controller && !lifecycle.controller.signal.aborted) return;
      if (performance.now() - lastChecked < 1000) return;
      lastChecked = performance.now();
      void check();
    }
    function activity(event: Event) {
      if (event.isTrusted && performance.now() - lastChecked >= 60000)
        revalidate();
    }
    function expired() {
      ++lifecycle.generation;
      lifecycle.controller?.abort();
      setState({ path: pathname, result: { kind: "unauthenticated" } });
    }
    function signedOut() {
      ++lifecycle.generation;
      lifecycle.controller?.abort();
      setState({ path: pathname, result: { kind: "checking" } });
      window.location.replace("/login");
    }
    window.addEventListener("focus", revalidate);
    window.addEventListener("pageshow", revalidate);
    window.addEventListener("akiba:session-expired", expired);
    window.addEventListener("akiba:signed-out", signedOut);
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("pointerdown", activity, { passive: true });
    window.addEventListener("keydown", activity);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("akiba-owner-session")
        : null;
    if (channel)
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === "signed-out") signedOut();
      };
    return () => {
      ++lifecycle.generation;
      lifecycle.controller?.abort();
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("pageshow", revalidate);
      window.removeEventListener("akiba:session-expired", expired);
      window.removeEventListener("akiba:signed-out", signedOut);
      document.removeEventListener("visibilitychange", revalidate);
      channel?.close();
    };
  }, [check, pathname]);

  const result = state.path === pathname ? state.result : CHECKING;

  useEffect(() => {
    if (result.kind === "unauthenticated") {
      window.location.replace(
        "/login?expired=1&next=" +
          encodeURIComponent(safeDestination(pathname)),
      );
    }
    if (result.kind !== "authenticated") return;
    const remaining = Date.parse(result.session.expiresAt) - Date.now();
    const timer = window.setTimeout(
      () => {
        // An earlier background response must not restore an expired session.
        const lifecycle = requests.current;
        ++lifecycle.generation;
        lifecycle.controller?.abort();
        setState({ path: pathname, result: { kind: "unauthenticated" } });
      },
      Math.max(0, Math.min(remaining, 2147483647)),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [pathname, result]);

  if (result.kind === "authenticated") {
    return <SessionContext value={result.session}>{children}</SessionContext>;
  }
  if (result.kind === "denied" || result.kind === "unavailable") {
    return (
      <main className={styles.blocked}>
        <AuthNotice
          title={result.kind === "denied" ? "Access unavailable" : undefined}
          message={result.problem.message}
          requestId={result.problem.requestId}
          onRetryAction={refresh}
        />
      </main>
    );
  }
  return (
    <LoadingState
      phase={
        result.kind === "unauthenticated" ? "session-expired" : "session-check"
      }
    />
  );
}

export function useOwnerSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("A verified organization session is required.");
  return session;
}
