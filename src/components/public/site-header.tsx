import Link from "next/link";
import { Search } from "lucide-react";
import { Brand } from "@/components/public/brand";

export function SiteHeader() {
  return (
    <header className="sh-header">
      <div className="sh-container sh-header-inner">
        <Brand />
        <nav className="sh-nav" aria-label="Main navigation">
          <Link href="/cities" className="sh-nav-link">Find a venue</Link>
          <Link href="/about" className="sh-nav-link sh-nav-about">Our approach</Link>
          <Link href="/search" className="sh-icon-button sh-header-search" aria-label="Search venues">
            <Search size={19} strokeWidth={1.6} aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </header>
  );
}