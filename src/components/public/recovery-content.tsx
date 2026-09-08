import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ArchMotif } from "@/components/public/artwork";

export function NotFoundContent() {
  return (
    <section className="sh-container sh-recovery-content">
      <ArchMotif className="sh-recovery-art" />
      <p className="sh-eyebrow">404 · A DIFFERENT DIRECTION</p>
      <h1 className="sh-display">This place isn’t<br /><em>on the page.</em></h1>
      <p>The link may have changed, or this guide or venue may no longer be public. Let’s find somewhere useful to begin again.</p>
      <div className="sh-recovery-actions"><Link className="sh-button sh-button-primary" href="/cities">Explore city guides<ArrowRight size={17} aria-hidden="true" /></Link><Link className="sh-button sh-button-secondary" href="/">Back to Shagun</Link></div>
    </section>
  );
}

export function LoadingContent() {
  return (
    <section className="sh-container sh-loading-content" aria-busy="true" aria-labelledby="loading-title">
      <p className="sh-eyebrow">ONE MOMENT</p>
      <h1 className="sh-display" id="loading-title">Finding the details.</h1>
      <p role="status">Loading the next page. A little closer to your celebration.</p>
      <div className="sh-loading-cards" aria-hidden="true">
        {[0, 1, 2].map((item) => <div className="sh-loading-card" key={item}><div className="sh-skeleton sh-loading-image" /><div className="sh-loading-lines"><span className="sh-skeleton" /><span className="sh-skeleton" /><span className="sh-skeleton" /></div></div>)}
      </div>
    </section>
  );
}