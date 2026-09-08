/** Original decorative linework. Never presented as a photograph of a real place. */
export function ArchMotif({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 200" fill="none" aria-hidden="true">
      <path d="M59 176V85a61 61 0 0 1 122 0v91" fill="var(--sh-sage-light, #e6eae1)" />
      <path d="M76 176V86a44 44 0 0 1 88 0v90" fill="var(--sh-paper, #faf7f2)" />
      <path d="M86 176V87a34 34 0 0 1 68 0v89M47 176h146M56 183h128" stroke="var(--sh-clay, #9b654f)" strokeWidth="1.25" />
      <path d="M120 39v21m-10-11h20" stroke="var(--sh-clay, #9b654f)" strokeWidth="1.25" />
      <path d="M42 176c7-26-12-51-9-76m9 51c-19-4-25-15-23-25 16 3 23 12 23 25Zm-1-16c15-6 18-17 14-25-13 5-16 15-14 25Zm153 41c-7-26 12-51 9-76m-9 51c19-4 25-15 23-25-16 3-23 12-23 25Zm1-16c-15-6-18-17-14-25 13 5 16 15 14 25Z" fill="var(--sh-sage, #54675a)" />
      <path d="M30 176h24l-3 10H33Zm156 0h24l-3 10h-18Z" fill="var(--sh-clay-light, #e9d6c8)" />
      <circle cx="120" cy="104" r="4" fill="var(--sh-clay, #9b654f)" />
    </svg>
  );
}

export function PhotoFallback({ label = "Venue photograph not available" }: { label?: string }) {
  return (
    <div className="sh-photo-fallback" role="img" aria-label={`${label}. Decorative illustration, not a venue photograph.`}>
      <ArchMotif />
      <span>{label}</span>
      <small>Decorative illustration</small>
    </div>
  );
}