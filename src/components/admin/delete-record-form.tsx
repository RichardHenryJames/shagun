"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import type { ActionState } from "@/lib/types";
import { FormFeedback, InputField } from "@/components/admin/form-fields";

export function DeleteRecordForm({ kind, id, name, expected_updated_at, disabled_reason, action }: {
  kind: "city" | "venue"; id: string; name: string; expected_updated_at: string; disabled_reason?: string;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [confirmName, setConfirmName] = useState("");
  const inputId = `${kind}-confirm_name`;
  return (
    <details className="a-danger-zone" id={`${kind}-delete`}>
      <summary>Archive or permanently delete this {kind}</summary>
      <p><a className="a-link" href={`#${kind}-publishing`}>Choose Archived in {kind === "city" ? "Lifecycle" : "Publishing"}</a> and save to retain the record. Permanent deletion cannot be undone.</p>
      {disabled_reason && <p id={`${kind}-delete-disabled`} className="a-warning-text">{disabled_reason}</p>}
      <form action={formAction} className="a-delete-form" aria-busy={pending}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="expected_updated_at" value={expected_updated_at} />
        <FormFeedback state={state} fieldIds={{ confirm_name: inputId }} />
        <fieldset className="a-form-fields" disabled={pending || Boolean(disabled_reason)} aria-describedby={disabled_reason ? `${kind}-delete-disabled` : undefined}>
          <legend className="a-sr-only">Confirm permanent deletion</legend>
          <InputField id={inputId} name="confirm_name" label={`Type “${name}” to confirm permanent deletion`} autoComplete="off" spellCheck={false} required maxLength={180}
            value={confirmName} onChange={(event) => setConfirmName(event.target.value)} errors={state.fieldErrors?.confirm_name} hint="The name must match exactly. Related photos are removed and failed storage removals are queued for retry." />
          <div className="a-actions"><button type="submit" className="a-button a-button--danger" disabled={pending || Boolean(disabled_reason) || confirmName !== name}><Trash2 size={16} aria-hidden="true" />{pending ? "Deleting…" : `Permanently delete ${kind}`}</button></div>
        </fieldset>
      </form>
    </details>
  );
}