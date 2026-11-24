"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/shared/button";
import { Icon } from "@/components/shared/icon";
import { AuthRequestError, endSession } from "@/lib/auth/browser";
import styles from "./logout-button.module.css";

export function LogoutButton({
  label = "Sign out",
  disabled,
  fullWidth = false,
  icon,
}: {
  label?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
}) {
  const [error, setError] = useState<string>();
  return (
    <div className={styles.action} data-full-width={fullWidth || undefined}>
      <Button
        variant="secondary"
        disabled={disabled}
        fullWidth={fullWidth}
        loadingLabel="Signing out…"
        icon={icon ?? <Icon name="arrow-right" />}
        onClick={async () => {
          setError(undefined);
          try {
            await endSession();
            window.dispatchEvent(new Event("akiba:signed-out"));
            window.location.replace("/login");
          } catch (error: unknown) {
            setError(
              error instanceof AuthRequestError
                ? error.problem.message
                : "We couldn't confirm sign-out. Please try again.",
            );
          }
        }}
      >
        {label}
      </Button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
