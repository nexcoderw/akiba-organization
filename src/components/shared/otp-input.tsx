"use client";

import {
  Fragment,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type Ref,
  type SyntheticEvent,
} from "react";
import { descriptionIds, Field, type FieldProps } from "./field";
import { useSubmissionPending } from "./form";
import styles from "./otp-input.module.css";

export type OtpInputProps = FieldProps & {
  ref?: Ref<HTMLInputElement>;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Number of digits. Defaults to 6. */
  length?: number;
  /** Submit the surrounding form as soon as the last digit is entered. */
  autoSubmit?: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
};

/**
 * Segmented one-time-code field.
 *
 * One real <input> sits invisibly over the visual slots, so paste, SMS/OTP
 * autofill, mobile keyboards, Backspace and screen readers all behave like a
 * normal text field. The slots only render the value.
 */
export function OtpInput({
  id,
  label,
  hint,
  error,
  required,
  name,
  value,
  onValueChange,
  length = 6,
  autoSubmit = true,
  disabled,
  ref,
  "aria-describedby": externalDescription,
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);
  const submitting = useSubmissionPending();
  const [focused, setFocused] = useState(false);

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

  const digits = value.slice(0, length).split("");
  const active =
    focused && !disabled ? Math.min(digits.length, length - 1) : -1;

  // Auto-submit once, when the last digit lands; re-arm when the code is edited or cleared.
  useEffect(() => {
    if (value.length < length) {
      submitted.current = false;
      return;
    }
    if (!autoSubmit || disabled || submitted.current) return;
    submitted.current = true;
    inputRef.current?.form?.requestSubmit();
  }, [value, length, autoSubmit, disabled]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onValueChange(
      event.currentTarget.value.replace(/\D/g, "").slice(0, length),
    );
  }

  // Digits are only ever added or removed at the end, so keep the caret there.
  function keepCaretAtEnd(event: SyntheticEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const end = element.value.length;
    if (element.selectionStart !== end || element.selectionEnd !== end) {
      element.setSelectionRange(end, end);
    }
  }

  return (
    <Field id={id} label={label} hint={hint} error={error} required={required}>
      <div
        className={styles.root}
        data-invalid={Boolean(error) || undefined}
        data-disabled={disabled || undefined}
        data-pending={submitting || undefined}
      >
        <div className={styles.slots} aria-hidden="true">
          {Array.from({ length }, (_, index) => (
            <Fragment key={index}>
              {index === length / 2 && <span className={styles.dash} />}
              <span
                className={styles.slot}
                data-filled={Boolean(digits[index]) || undefined}
                data-active={active === index || undefined}
              >
                <span className={styles.digit}>{digits[index]}</span>
              </span>
            </Fragment>
          ))}
        </div>
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          value={value}
          disabled={disabled}
          readOnly={submitting}
          required={required}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby={descriptionIds(
            id,
            hint,
            error,
            externalDescription,
          )}
          className={styles.native}
          onChange={handleChange}
          onSelect={keepCaretAtEnd}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
    </Field>
  );
}
