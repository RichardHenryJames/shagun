import { NotFoundContent } from "@/components/public/recovery-content";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";

export default function NotFound() {
  return <div className="sh-site sh-recovery-shell"><SiteHeader /><main id="main-content" tabIndex={-1}><NotFoundContent /></main><SiteFooter /></div>;
}