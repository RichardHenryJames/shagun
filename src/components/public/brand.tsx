import Link from "next/link";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="36" height="42" viewBox="0 0 36 42" fill="none" aria-hidden="true">
      <path d="M4 38V19a14 14 0 0 1 28 0v19M10 38V19a8 8 0 0 1 16 0v19M1 38h34" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 12c-4 0-5 6 0 8 5-2 4-8 0-8Z" fill="currentColor" />
      <path d="M18 2v4M4 9l3 2m25-2-3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Brand() {
  return (
    <Link href="/" className="sh-brand" aria-label="Shagun — home">
      <BrandMark />
      <span>Shagun<span className="sh-brand-dot" aria-hidden="true">.</span></span>
    </Link>
  );
}