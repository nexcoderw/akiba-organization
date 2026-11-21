import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthNotice } from "@/components/auth/auth-notice";
import { getSession } from "@/lib/auth/session.server";

export const metadata = {
  title: "Organization sign-in · Akiba",
  robots: { index: false, follow: false },
};

async function Login() {
  const result = await getSession();
  if (result.kind === "authenticated") redirect("/");
  if (result.kind === "unavailable" || result.kind === "denied") {
    return (
      <AuthNotice
        title={result.kind === "denied" ? "Access unavailable" : undefined}
        message={result.problem.message}
        requestId={result.problem.requestId}
      />
    );
  }
  return (
    <AuthNotice
      title="Organization sign-in is unavailable"
      message="Organization verification is still being set up. If you received an invitation, open the link in your email to review it."
      retryable={false}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}
