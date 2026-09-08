import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/public/brand";

export function SiteFooter() {
  return (
    <footer className="sh-footer">
      <div className="sh-container">
        <div className="sh-footer-top">
          <div className="sh-footer-brand">
            <Brand />
            <p>Good beginnings.<br />Thoughtfully chosen places.</p>
          </div>
          <div className="sh-footer-note">
            <p className="sh-eyebrow">A NOTE FROM SHAGUN</p>
            <p>A directory, not a booking service. Speak with each venue to confirm your date, prices and the finer details.</p>
            <Link className="sh-text-link" href="/about">How we approach listings <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
          <nav className="sh-footer-nav" aria-label="Footer navigation">
            <span className="sh-eyebrow">EXPLORE</span>
            <Link href="/cities">City guides</Link>
            <Link href="/search">Search venues</Link>
            <Link href="/about">About Shagun</Link>
            <Link href="/privacy">Privacy & corrections</Link>
          </nav>
        </div>
        <div className="sh-footer-bottom">
          <span>Shagun · Wedding venues, city by city.</span>
          <span>Open details. Direct conversations.</span>
        </div>
      </div>
    </footer>
  );
}