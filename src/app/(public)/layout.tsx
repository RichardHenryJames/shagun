import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";

// Public inventory must be evaluated at request time, never snapshotted by a build.
export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sh-site">
      <SiteHeader />
      <main id="main-content" className="sh-main" tabIndex={-1}>{children}</main>
      <SiteFooter />
    </div>
  );
}