"use client";

import { useEffect, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { ActionState } from "@/lib/types";

type CommonProps = { label: string; hint?: ReactNode; errors?: string[]; wrapperClassName?: string; name: string };

function describedBy(id: string, hint: ReactNode, errors: string[] | undefined, existing?: string) {
  return [existing, hint ? `${id}-hint` : "", errors?.length ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
}

export function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return <div id={`${id}-error`} className="a-field-error">{errors.map((error, index) => <p key={index}>{error}</p>)}</div>;
}

function FieldLabel({ id, label, required }: { id: string; label: string; required?: boolean }) {
  return <label htmlFor={id}>{label}{required && <span className="a-required" aria-hidden="true"> *</span>}</label>;
}

export function InputField({ label, hint, errors, wrapperClassName, id, name, className, ...props }: CommonProps & InputHTMLAttributes<HTMLInputElement>) {
  const fieldId = id ?? name;
  return (
    <div className={`a-field ${wrapperClassName ?? ""}`}>
      <FieldLabel id={fieldId} label={label} required={props.required} />
      <input {...props} id={fieldId} name={name} className={`a-input ${className ?? ""}`} aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, errors, props["aria-describedby"])} />
      {hint && <div className="a-field-hint" id={`${fieldId}-hint`}>{hint}</div>}
      <FieldErrors id={fieldId} errors={errors} />
    </div>
  );
}

export function TextareaField({ label, hint, errors, wrapperClassName, id, name, className, ...props }: CommonProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const fieldId = id ?? name;
  return (
    <div className={`a-field ${wrapperClassName ?? ""}`}>
      <FieldLabel id={fieldId} label={label} required={props.required} />
      <textarea {...props} id={fieldId} name={name} className={`a-input ${className ?? ""}`} aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, errors, props["aria-describedby"])} />
      {hint && <div className="a-field-hint" id={`${fieldId}-hint`}>{hint}</div>}
      <FieldErrors id={fieldId} errors={errors} />
    </div>
  );
}

export function SelectField({ label, hint, errors, wrapperClassName, id, name, className, children, ...props }: CommonProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const fieldId = id ?? name;
  return (
    <div className={`a-field ${wrapperClassName ?? ""}`}>
      <FieldLabel id={fieldId} label={label} required={props.required} />
      <select {...props} id={fieldId} name={name} className={`a-input ${className ?? ""}`} aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, errors, props["aria-describedby"])}>{children}</select>
      {hint && <div className="a-field-hint" id={`${fieldId}-hint`}>{hint}</div>}
      <FieldErrors id={fieldId} errors={errors} />
    </div>
  );
}

export function FormFeedback({ state, fieldIds = {} }: { state: ActionState; fieldIds?: Record<string, string> }) {
  const errorRef = useRef<HTMLDivElement>(null);
  const entries = Object.entries(state.fieldErrors ?? {}).filter(([, messages]) => messages.length > 0);
  useEffect(() => {
    if (state.error || Object.values(state.fieldErrors ?? {}).some((messages) => messages.length)) errorRef.current?.focus();
  }, [state]);

  if (state.error || entries.length > 0) {
    return (
      <div className="a-feedback" ref={errorRef} tabIndex={-1} role="alert" aria-atomic="true">
        <p><strong>{state.error || "Check the highlighted fields. Your changes have not been saved."}</strong></p>
        {entries.length > 0 && <ul>{entries.flatMap(([name, errors]) => errors.map((error, index) => (
          <li key={`${name}-${index}`}>{fieldIds[name] ? <a href={`#${fieldIds[name]}`}>{error}</a> : error}</li>
        )))}</ul>}
      </div>
    );
  }
  if (state.message) return <div className={state.success ? "a-feedback a-feedback--success" : "a-notice"} role="status" aria-live="polite">{state.message}</div>;
  return <div className="a-sr-only" role="status" aria-live="polite" />;
}