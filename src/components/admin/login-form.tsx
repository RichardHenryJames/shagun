"use client";

import { useActionState, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { loginAction } from "@/lib/actions/auth";
import type { ActionState } from "@/lib/types";
import { FormFeedback, InputField } from "@/components/admin/form-fields";

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, {});
  const [email, setEmail] = useState("");
  return (
    <form action={action} className="admin-login-form" aria-describedby="admin-login-help" aria-busy={pending}>
      <FormFeedback state={state} fieldIds={{ email: "login-email", password: "login-password" }} />
      <fieldset disabled={pending}>
        <legend className="a-sr-only">Administrator credentials</legend>
        <InputField id="login-email" name="email" label="Email address" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
          maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} errors={state.fieldErrors?.email} />
        <InputField id="login-password" name="password" label="Password" type="password" autoComplete="current-password" maxLength={128} required errors={state.fieldErrors?.password} />
        <button type="submit" className="a-button a-button--primary" disabled={pending}><LockKeyhole size={17} aria-hidden="true" />{pending ? "Signing in…" : "Sign in"}</button>
      </fieldset>
      <p className="a-field-hint" id="admin-login-help">Access is limited to securely provisioned, active administrators. Ask the deployment administrator if you need access or credential assistance.</p>
    </form>
  );
}