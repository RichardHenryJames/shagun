"use client";

/* eslint-disable @next/next/no-img-element -- Native images use the authenticated, no-store media endpoint, not the public image optimizer. */

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, ImagePlus, Star, Trash2, Upload } from "lucide-react";
import { photoUrl } from "@/lib/format";
import { photoMetadataSchema } from "@/lib/validation";
import type { ActionState, Photo } from "@/lib/types";
import { FormFeedback, InputField, TextareaField } from "@/components/admin/form-fields";

type Owner = { venueId?: string; cityId?: string };
type Operation = "cover" | "up" | "down" | "metadata" | "delete";
type Metadata = { alt_text: string; credit: string };
type UploadItem = {
  key: string; file: File; alt_text: string;
  status: "queued" | "uploading" | "uploaded" | "failed" | "invalid";
  error?: string; alt_errors?: string[];
};
type MediaResponse = { photo?: Photo; error?: string };

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function fileError(file: File): string | undefined {
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_FILE_BYTES) return "This file exceeds the 3 MB limit. Choose a smaller image.";
  if (!/\.(jpe?g|png|webp)$/i.test(file.name) || (file.type && !MEDIA_TYPES.has(file.type))) return "Only JPEG, PNG and WebP files are accepted. SVG and animated formats are not supported.";
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed. Check your connection and try again.";
}

async function mediaRequest(path: string, init: RequestInit): Promise<MediaResponse> {
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", redirect: "error" });
  const body: unknown = await response.json().catch(() => null);
  const data = body && typeof body === "object" ? body as MediaResponse : {};
  if (!response.ok || typeof data.error === "string") {
    throw new Error(typeof data.error === "string" ? data.error : `The media request failed (HTTP ${response.status}). Your session may have expired; sign in again if needed.`);
  }
  return data;
}

function PhotoMetadataEditor({ photo, disabled, onSave }: {
  photo: Photo; disabled: boolean; onSave: (metadata: Metadata) => Promise<boolean>;
}) {
  const [alt_text, setAltText] = useState(photo.alt_text);
  const [credit, setCredit] = useState(photo.credit ?? "");
  const [state, setState] = useState<ActionState>({});
  const altId = `photo-${photo.id}-alt_text`;
  const creditId = `photo-${photo.id}-credit`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const parsed = photoMetadataSchema.safeParse({ alt_text, credit });
    if (!parsed.success) {
      setState({ error: "Check the photo description and rights credit.", fieldErrors: parsed.error.flatten().fieldErrors });
      return;
    }
    setState({});
    await onSave(parsed.data);
  }

  return (
    <form onSubmit={submit} aria-label="Edit photo description and credit">
      <FormFeedback state={state} fieldIds={{ alt_text: altId, credit: creditId }} />
      <fieldset className="a-form-fields" disabled={disabled}>
        <legend className="a-sr-only">Photo metadata</legend>
        <div className="a-form-grid">
          <InputField id={altId} name="alt_text" label="Alternative text" required minLength={5} maxLength={250} value={alt_text} onChange={(event) => setAltText(event.target.value)} errors={state.fieldErrors?.alt_text} wrapperClassName="a-span-full" />
          <TextareaField id={creditId} name="credit" label="Rights / provenance credit" required minLength={5} maxLength={300} rows={3} value={credit} onChange={(event) => setCredit(event.target.value)} errors={state.fieldErrors?.credit} wrapperClassName="a-span-full" hint="Record the rights holder and permission or licence, not just a source link." />
          <div className="a-span-full"><button type="submit" className="a-button" disabled={disabled}>Save photo details</button></div>
        </div>
      </fieldset>
    </form>
  );
}

export function PhotoManager({ owner, photos }: { owner: Owner; photos: Photo[] }) {
  const router = useRouter();
  const uid = useId();
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [credit, setCredit] = useState("");
  const [batchState, setBatchState] = useState<ActionState>({});
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState("");
  const [photoErrors, setPhotoErrors] = useState<Record<string, string>>({});
  const mutationLock = useRef(false);
  const validOwner = Boolean(owner.cityId) !== Boolean(owner.venueId);
  const disabled = busy || refreshing || !validOwner;
  const orderedPhotos = [...photos].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const completed = queue.filter((item) => item.status === "uploaded").length;
  const remaining = queue.filter((item) => item.status === "queued" || item.status === "failed").length;

  function updateItem(key: string, update: Partial<UploadItem>) {
    setQueue((previous) => previous.map((item) => item.key === key ? { ...item, ...update } : item));
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationLock.current || disabled) return;
    const candidates = queue.filter((item) => item.status === "queued" || item.status === "failed");
    if (!candidates.length) {
      setBatchState({ error: "Choose at least one valid image that has not already been uploaded." });
      return;
    }
    const parsedCredit = photoMetadataSchema.shape.credit.safeParse(credit);
    if (!parsedCredit.success) {
      setBatchState({ error: "A rights / provenance credit is required for this batch.", fieldErrors: { credit: parsedCredit.error.issues.map((issue) => issue.message) } });
      return;
    }
    let invalidAlt = false;
    for (const item of candidates) {
      const parsedAlt = photoMetadataSchema.shape.alt_text.safeParse(item.alt_text);
      if (!parsedAlt.success) {
        invalidAlt = true;
        updateItem(item.key, { alt_errors: parsedAlt.error.issues.map((issue) => issue.message) });
      }
    }
    if (invalidAlt) {
      setBatchState({ error: "Write meaningful alternative text for every image before uploading." });
      return;
    }

    mutationLock.current = true;
    setBusy(true);
    setBatchState({});
    setMessage("");
    let succeeded = 0;
    let failed = 0;
    try {
      // Deliberately one file per request, in order. Completed files are never retried.
      for (const item of candidates) {
        updateItem(item.key, { status: "uploading", error: undefined, alt_errors: undefined });
        const body = new FormData();
        body.set("file", item.file);
        body.set(owner.venueId ? "venue_id" : "city_id", owner.venueId ?? owner.cityId!);
        body.set("alt_text", item.alt_text.trim());
        body.set("credit", parsedCredit.data);
        try {
          const data = await mediaRequest("/api/admin/media", { method: "POST", body });
          if (!data.photo || typeof data.photo.id !== "string") throw new Error("The server did not return a saved photo. Refresh and check the gallery before retrying to avoid a duplicate upload.");
          updateItem(item.key, { status: "uploaded" });
          succeeded += 1;
          startRefresh(() => router.refresh());
        } catch (error) {
          updateItem(item.key, { status: "failed", error: errorMessage(error) });
          failed += 1;
        }
      }
      setBatchState({
        success: failed === 0,
        ...(failed ? { error: `${succeeded} uploaded; ${failed} failed. See the per-file errors below. Only failed files will be retried.` }
          : { message: `${succeeded} photo${succeeded === 1 ? "" : "s"} uploaded. Saved photos are shown below.` }),
      });
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  async function mutatePhoto(photo: Photo, operation: Operation, metadata?: Metadata): Promise<boolean> {
    if (mutationLock.current || disabled) return false;
    if (operation === "delete" && !window.confirm(`Permanently delete this photo?\n\n${photo.alt_text}\n\nThis cannot be undone. Archiving the ${owner.cityId ? "city" : "venue"} instead keeps its photos.`)) return false;
    mutationLock.current = true;
    setBusy(true);
    setMessage("");
    setPhotoErrors((previous) => ({ ...previous, [photo.id]: "" }));
    try {
      await mediaRequest(`/api/admin/media/${encodeURIComponent(photo.id)}`, operation === "delete" ? { method: "DELETE" } : {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, ...metadata }),
      });
      setMessage(operation === "delete" ? "Photo deleted. Any failed storage removal can be retried from the dashboard."
        : operation === "cover" ? "Cover photo updated." : operation === "metadata" ? "Photo description and credit saved." : "Photo order updated.");
      startRefresh(() => router.refresh());
      return true;
    } catch (error) {
      setPhotoErrors((previous) => ({ ...previous, [photo.id]: errorMessage(error) }));
      return false;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="a-photo-manager">
      {!validOwner && <div className="a-feedback" role="alert">Photos require exactly one saved city or venue. Uploading is unavailable for this record.</div>}
      <p className="a-section-description">Step 2 · Upload only images you have permission to publish. Save any listing edits first: photo operations refresh saved data. Alternative text is required for each image; rights credit is shared by the batch and can be edited per photo later.</p>
      <form className="a-upload-form" onSubmit={upload} aria-busy={busy}>
        <h3 className="a-section-title">Upload photos</h3>
        <p className="a-section-description" id={`${uid}-upload-help`}>JPEG, PNG or WebP only, up to 3 MB per file. Files upload sequentially. The server validates image bytes and dimensions, removes metadata and re-encodes the image; a filename extension alone is not approval.</p>
        <FormFeedback state={batchState} fieldIds={{ credit: `${uid}-batch-credit` }} />
        <fieldset className="a-form-fields" disabled={disabled}>
          <legend className="a-sr-only">New photos and rights credit</legend>
          <div className="a-form-grid">
            <InputField id={`${uid}-files`} name="files" label="Choose images" type="file" accept=".jpeg,.jpg,.png,.webp,image/jpeg,image/png,image/webp" multiple
              required={queue.length === 0} aria-describedby={`${uid}-upload-help`} wrapperClassName="a-span-full" onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                setQueue((previous) => [...previous, ...files.map((file): UploadItem => {
                  const error = fileError(file);
                  return { key: crypto.randomUUID(), file, alt_text: "", status: error ? "invalid" : "queued", error };
                })]);
                event.target.value = "";
                setBatchState({});
              }} />
            <TextareaField id={`${uid}-batch-credit`} name="credit" label="Rights / provenance credit for this batch" required minLength={5} maxLength={300} rows={3}
              value={credit} onChange={(event) => setCredit(event.target.value)} errors={batchState.fieldErrors?.credit} wrapperClassName="a-span-full"
              hint="Name the rights holder and permission or licence. A source URL alone does not establish permission. Do not include private contact details; credits may be displayed publicly." />
          </div>
          {queue.length > 0 && (
            <>
              <p className="a-upload-status" role="status" aria-live="polite">{completed} of {queue.length} selected files uploaded.</p>
              <progress className="a-upload-progress" value={completed} max={queue.length} aria-label="Selected files successfully uploaded" />
              <ol className="a-upload-queue">{queue.map((item) => (
                <li className="a-upload-item" key={item.key}>
                  <div className="a-upload-item-header"><div><p>{item.file.name}</p><span className="a-field-hint">{(item.file.size / 1024 / 1024).toFixed(2)} MB</span></div>
                    <button className="a-button a-button--quiet" type="button" disabled={busy || refreshing} onClick={() => setQueue((previous) => previous.filter((entry) => entry.key !== item.key))} aria-label={`${item.status === "uploaded" ? "Dismiss" : "Remove"} ${item.file.name} from upload queue`}>{item.status === "uploaded" ? "Dismiss" : "Remove"}</button></div>
                  <InputField id={`${uid}-${item.key}-alt`} name={`alt-${item.key}`} label={`Alternative text for ${item.file.name}`} required={item.status !== "invalid" && item.status !== "uploaded"}
                    minLength={5} maxLength={250} value={item.alt_text} disabled={disabled || item.status === "uploaded" || item.status === "invalid"} errors={item.alt_errors}
                    onChange={(event) => updateItem(item.key, { alt_text: event.target.value, alt_errors: undefined })} hint="Describe what is actually visible, without promotional language." />
                  <div className="a-upload-status" role="status" aria-live="polite">
                    {item.status === "queued" && "Waiting to upload"}
                    {item.status === "uploading" && <><span>Uploading and processing…</span><progress className="a-upload-progress" aria-label={`Uploading and processing ${item.file.name}`} /></>}
                    {item.status === "uploaded" && <span><Check size={14} aria-hidden="true" /> Uploaded</span>}
                  </div>
                  {item.error && <p className="a-field-error" role="alert">{item.error}</p>}
                </li>
              ))}</ol>
            </>
          )}
          <div className="a-upload-actions"><button type="submit" className="a-button a-button--primary" disabled={disabled || remaining === 0}><Upload size={16} aria-hidden="true" />{busy ? "Working…" : completed > 0 || queue.some((item) => item.status === "failed") ? "Upload remaining photos" : "Upload photos"}</button><span className="a-field-hint">Keep this page open until the batch finishes.</span></div>
        </fieldset>
      </form>
      <div role="status" aria-live="polite" aria-atomic="true">{message && <p className="a-notice a-notice--success">{message}</p>}{refreshing && <p className="a-field-hint">Refreshing saved photos…</p>}</div>
      {orderedPhotos.length === 0 ? (
        <div className="a-empty"><ImagePlus size={24} aria-hidden="true" /><h3 className="a-section-title">No saved photos</h3><p>Add an authorised image above. No stock photo or placeholder will be presented as a real venue.</p></div>
      ) : (
        <ol className="a-photo-grid" aria-label="Saved photos in display order">{orderedPhotos.map((photo, index) => (
          <li className="a-photo-card" key={photo.id}>
            <img src={photoUrl(photo.id, 480, true)} alt={photo.alt_text || "Inventory photo; alternative text has not been recorded"} width={photo.width} height={photo.height} loading="lazy" decoding="async" />
            <div className="a-photo-body">
              <div className="a-photo-caption"><h3 className="a-section-title">Photo {index + 1}</h3>{photo.is_cover && <span className="a-badge a-badge--positive"><Star size={12} aria-hidden="true" /> Cover</span>}</div>
              <p>{photo.alt_text}</p><p className="a-muted">{photo.credit || "Rights credit missing — update before publishing."}</p>
              <div className="a-photo-controls">
                <button type="button" className="a-button" disabled={disabled || photo.is_cover} onClick={() => void mutatePhoto(photo, "cover")} aria-label={`Set photo ${index + 1} as cover`}><Star size={15} aria-hidden="true" />{photo.is_cover ? "Cover" : "Set cover"}</button>
                <button type="button" className="a-button" disabled={disabled || index === 0} onClick={() => void mutatePhoto(photo, "up")} aria-label={`Move photo ${index + 1} up`}><ArrowUp size={15} aria-hidden="true" />Up</button>
                <button type="button" className="a-button" disabled={disabled || index === orderedPhotos.length - 1} onClick={() => void mutatePhoto(photo, "down")} aria-label={`Move photo ${index + 1} down`}><ArrowDown size={15} aria-hidden="true" />Down</button>
                <button type="button" className="a-button a-button--danger" disabled={disabled} onClick={() => void mutatePhoto(photo, "delete")} aria-label={`Delete photo ${index + 1}`}><Trash2 size={15} aria-hidden="true" />Delete</button>
              </div>
              {photoErrors[photo.id] && <p className="a-field-error" role="alert">{photoErrors[photo.id]}</p>}
              <details className="a-photo-details"><summary>Edit alternative text & credit</summary><PhotoMetadataEditor key={`${photo.alt_text}\u0000${photo.credit ?? ""}`} photo={photo} disabled={disabled} onSave={(metadata) => mutatePhoto(photo, "metadata", metadata)} /></details>
            </div>
          </li>
        ))}</ol>
      )}
    </div>
  );
}