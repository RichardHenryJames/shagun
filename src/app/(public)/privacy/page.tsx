import { createMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { CorrectionsNote } from "@/components/public/corrections-note";

export const metadata = createMetadata({
  title: "Privacy & corrections",
  description: "How Shagun approaches public listing information, optional aggregate analytics, direct contact links and corrections.",
  path: "/privacy",
});

export default function PrivacyPage() {
  const analyticsEnabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true";
  return (
    <div className="sh-container sh-editorial-page">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Privacy & corrections" }]} />
      <header className="sh-page-heading">
        <p className="sh-eyebrow">PLAINLY PUT</p>
        <h1 className="sh-display">A little clarity<br /><em>about your privacy.</em></h1>
        <p className="sh-page-intro">Explore without an account. Contact venues without handing your details to Shagun. Here is how the public directory works.</p>
      </header>
      <div className="sh-prose">
        <section><h2>Browsing the directory</h2><p>You do not need to create an account to browse city guides, view published venue details or use the published contact links. Shagun does not provide a public enquiry form, booking checkout or payment collection.</p><p>Search terms and filters appear in the page URL so that you can save or share a search. Avoid putting personal or sensitive information in a search box, and check a URL before sharing it.</p></section>
        <section><h2>Optional aggregate analytics</h2><p className="sh-privacy-status"><span className="sh-status-dot" aria-hidden="true" />{analyticsEnabled ? "Optional aggregate analytics are enabled on this deployment." : "Optional aggregate analytics are currently turned off."}</p><p>When enabled, lightweight events help count city and venue views, city-scoped searches, filter use, and clicks on phone or WhatsApp links. The event payload contains the event name and the relevant city or venue identifier — not your search text, phone number or email address.</p><p>These analytics do not set cookies, use local storage or create a visitor profile. The client respects the browser’s Do Not Track signal and Global Privacy Control. A contact-click count does not record whether a call connected or what was said.</p></section>
        <section><h2>Links that leave Shagun</h2><p>Telephone links open your calling application. WhatsApp links open WhatsApp, and a map link opens Google Maps only when a location has been recorded. These services are not embedded in the venue page.</p><p>When you choose to use an external service, that service’s own privacy practices apply. Anything you share directly with a venue is part of your conversation with that venue, not an enquiry submitted to Shagun.</p></section>
        <section><h2>Technical requests and administration</h2><p>Hosting and security services may process technical request information needed to deliver and protect the website. This is separate from the optional aggregate event payload described above.</p><p>Private administrative sign-in uses necessary authentication cookies. The public directory does not require administrative sign-in, and private operational research is not part of a public listing.</p></section>
        <section><h2>Public venue information</h2><p>Published listings may include a venue’s business address, contact details, facilities, indicative pricing and photographs. These details can change. A recorded check date is not a promise that every detail remains current.</p><p>Venue photographs are distinct from Shagun’s original decorative illustrations. Missing photographs or facts are not replaced with invented venue information, ratings or reviews.</p></section>
        <section><h2>Corrections and image concerns</h2><CorrectionsNote /><p>When a corrections channel is available, include the venue’s listing URL and explain the detail or image that needs attention. Share only the information needed to understand the correction; avoid sending identity documents, payment information or other sensitive material.</p></section>
      </div>
    </div>
  );
}