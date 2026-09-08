"use client";

import { useId, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { photoUrl } from "@/lib/format";
import type { Photo } from "@/lib/types";
import { PhotoFallback } from "@/components/public/artwork";
import { MediaPhoto } from "@/components/public/media-photo";
import { useNativeDialog } from "@/components/public/use-native-dialog";

export function VenueGallery({ photos, venueName, preview = false }: { photos: Photo[]; venueName: string; preview?: boolean }) {
  const titleId = useId();
  const { dialogRef, openDialog, closeDialog, restoreFocus, dismissBackdrop } = useNativeDialog();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const ordered = [...photos].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order);
  const activePhoto = activeIndex === null ? null : ordered[activeIndex];
  const move = (direction: number) => setActiveIndex((index) => index === null ? null : (index + direction + ordered.length) % ordered.length);

  if (!ordered.length) {
    return <div className="sh-gallery-empty"><PhotoFallback /><p>Photographs will appear here when they are available for this listing.</p></div>;
  }

  return (
    <section className="sh-gallery" aria-label={`Photographs of ${venueName}`}>
      <div className={`sh-gallery-grid sh-gallery-count-${Math.min(ordered.length, 5)}`}>
        {ordered.map((photo, index) => (
          <figure className="sh-gallery-item" key={photo.id}>
            <a
              href={photoUrl(photo.id, 1600, preview)}
              aria-label={`Open photo ${index + 1} of ${ordered.length}: ${photo.alt_text}`}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                setActiveIndex(index);
                openDialog(event.currentTarget);
              }}
            >
              <MediaPhoto
                photo={photo}
                preview={preview}
                priority={index === 0}
                sizes={ordered.length === 1
                  ? "(max-width: 767px) 86vw, (max-width: 1279px) 94vw, 1240px"
                  : index === 0 ? "(max-width: 767px) 86vw, (max-width: 1279px) 58vw, 740px" : "(max-width: 767px) 86vw, (max-width: 1279px) 30vw, 370px"}
              />
              <span className="sh-gallery-expand" aria-hidden="true"><Expand size={18} /></span>
            </a>
            <figcaption><span>{photo.alt_text}</span>{photo.credit && <span className="sh-photo-credit">Photo: {photo.credit}</span>}</figcaption>
          </figure>
        ))}
      </div>
      <div className="sh-gallery-footer">
        <p>{ordered.length} {ordered.length === 1 ? "photograph" : "photographs"}{ordered.length > 1 && <span className="sh-gallery-swipe"> · Swipe to explore</span>}</p>
        <a
          className="sh-text-link"
          href={photoUrl(ordered[0].id, 1600, preview)}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            setActiveIndex(0);
            openDialog(event.currentTarget);
          }}
        >View {ordered.length === 1 ? "photograph" : "all photographs"}<Expand size={16} aria-hidden="true" /></a>
      </div>
      <dialog
        ref={dialogRef}
        className="sh-gallery-dialog"
        aria-labelledby={titleId}
        onClick={dismissBackdrop}
        onClose={() => { restoreFocus(); setActiveIndex(null); }}
        onKeyDown={(event) => {
          if (ordered.length < 2) return;
          if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
          if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
        }}
      >
        <div className="sh-gallery-modal-header">
          <h2 id={titleId}>{venueName} <span>— photographs</span></h2>
          <button type="button" className="sh-icon-button" onClick={closeDialog} aria-label="Close photo gallery" data-dialog-focus><X size={23} aria-hidden="true" /></button>
        </div>
        {activePhoto && activeIndex !== null && (
          <>
            <figure className="sh-gallery-slide">
              <MediaPhoto key={activePhoto.id} photo={activePhoto} preview={preview} priority sizes="(max-width: 767px) 100vw, 90vw" className="sh-gallery-full-image" />
              <figcaption>
                <p>{activePhoto.alt_text}</p>
                {activePhoto.credit && <p className="sh-photo-credit">Photo: {activePhoto.credit}</p>}
              </figcaption>
            </figure>
            <div className="sh-gallery-modal-controls">
              <button type="button" className="sh-icon-button" disabled={ordered.length === 1} onClick={() => move(-1)} aria-label="Previous photograph"><ChevronLeft size={24} aria-hidden="true" /></button>
              <p aria-live="polite" aria-atomic="true">Photo {activeIndex + 1} <span>of {ordered.length}</span></p>
              <button type="button" className="sh-icon-button" disabled={ordered.length === 1} onClick={() => move(1)} aria-label="Next photograph"><ChevronRight size={24} aria-hidden="true" /></button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}