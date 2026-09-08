/* These are already-sized, access-checked WebP derivatives; do not optimize them twice. */
"use client";

import { useCallback, useState } from "react";
import { photoUrl } from "@/lib/format";
import type { Photo } from "@/lib/types";
import { PhotoFallback } from "@/components/public/artwork";

export function MediaPhoto({
  photo,
  preview = false,
  priority = false,
  sizes = "(max-width: 639px) calc(100vw - 40px), (max-width: 991px) 46vw, 380px",
  className = "",
  fallbackLabel,
}: {
  photo: Photo;
  preview?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const source = `${preview ? "private" : "public"}:${photo.id}`;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const imageRef = useCallback((node: HTMLImageElement | null) => {
    // An image can fail before hydration attaches its error listener.
    if (node?.complete && node.currentSrc && node.naturalWidth === 0) setFailedSource(source);
  }, [source]);
  const candidates = ([480, 960, 1600] as const).map((width) => ({ url: photoUrl(photo.id, width, preview), width: Math.min(width, photo.width) }));
  const srcSet = candidates.filter((candidate, index) => index === 0 || candidate.width !== candidates[index - 1].width)
    .map((candidate) => `${candidate.url} ${candidate.width}w`).join(", ");

  return (
    <div className={`sh-media ${className}`}>
      {failedSource === source ? <PhotoFallback label={fallbackLabel} /> : (
        <picture>
          <source type="image/webp" srcSet={srcSet} sizes={sizes} />
          <img
            ref={imageRef}
            src={photoUrl(photo.id, 960, preview)}
            srcSet={srcSet}
            sizes={sizes}
            width={photo.width}
            height={photo.height}
            alt={photo.alt_text}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            onError={() => setFailedSource(source)}
          />
        </picture>
      )}
    </div>
  );
}