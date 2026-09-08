import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { createMetadata } from "@/lib/seo";
import { ArchMotif } from "@/components/public/artwork";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { CorrectionsNote } from "@/components/public/corrections-note";

export const metadata = createMetadata({
  title: "Our approach",
  description: "The Shagun approach: useful local venue information, transparent listing standards, dated checks and direct contact. No made-up reviews or booking promises.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <div className="sh-container sh-editorial-page">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Our approach" }]} />
      <header className="sh-editorial-hero">
        <div><p className="sh-eyebrow">THE SHAGUN APPROACH</p><h1 className="sh-display">Good beginnings.<br /><em>Clearer choices.</em></h1><p className="sh-page-intro">Finding a wedding venue should begin with useful information, not a form asking for your phone number.</p></div>
        <ArchMotif className="sh-about-art" />
      </header>

      <section className="sh-story-layout">
        <p className="sh-eyebrow">WHY SHAGUN EXISTS</p>
        <div><h2 className="sh-section-title">A place for the practical things.<br />And the possibilities.</h2><p>A celebration brings a lot of decisions. Shagun brings the venue details into one place: where a venue is, what has been recorded about it, and how to speak with it directly.</p><p>We’re building a city-by-city directory of vivah bhawans, marriage halls and other wedding venues. Each guide grows as listings are prepared and published. An empty guide is better than an invented recommendation.</p></div>
      </section>

      <section className="sh-values-section" aria-labelledby="standards-title">
        <p className="sh-eyebrow">OUR LISTING STANDARDS</p>
        <h2 className="sh-section-title" id="standards-title">Thoughtful doesn’t have to mean complicated.</h2>
        <div className="sh-values-grid">
          <article><span className="sh-step-number" aria-hidden="true">01</span><h3>Record what’s known.</h3><p>Capacities, facilities and prices appear when they are recorded. Missing information is not filled in with guesses. Prices always need a basis to be meaningfully compared.</p></article>
          <article><span className="sh-step-number" aria-hidden="true">02</span><h3>Be clear about checks.</h3><p>“Details checked” means listing information has a recorded check within the last 90 days. It is not an endorsement, a rating or a guarantee of availability.</p></article>
          <article><span className="sh-step-number" aria-hidden="true">03</span><h3>Keep pictures honest.</h3><p>Venue images should have appropriate publication permission, descriptive text and credits. Where photographs are missing, a clearly labelled illustration takes their place.</p></article>
        </div>
      </section>

      <section className="sh-story-layout">
        <p className="sh-eyebrow">HOW A GUIDE TAKES SHAPE</p>
        <div><h2 className="sh-section-title">Prepared first. Published second.</h2><p>Venue information is assembled and reviewed before a listing is made public. A city guide appears only when it has been activated, and search shows only published venues in active guides.</p><p>Details can change after a check. A listing can be corrected, taken offline or reviewed again. If a link you saved is no longer available, the venue may no longer be published in the directory.</p></div>
      </section>

      <section className="sh-note-panel">
        <p className="sh-eyebrow">AN IMPORTANT DISTINCTION</p>
        <h2 className="sh-section-title">We introduce the information.<br />You make the arrangements.</h2>
        <p>Shagun is not a booking service. We do not confirm availability, accept deposits, arrange site visits or negotiate prices. Speak with the venue, visit when possible, and agree on the price and terms directly.</p>
        <p>There are no customer ratings or reviews to interpret, no enquiry gate and no account needed to access published venue contacts.</p>
        <Link href="/cities" className="sh-button sh-button-primary">Explore the city guides<ArrowRight size={17} aria-hidden="true" /></Link>
      </section>

      <section className="sh-corrections-note">
        <h2>Useful information is a shared effort.</h2>
        <CorrectionsNote />
        <Link href="/privacy" className="sh-text-link">Privacy & corrections<ArrowUpRight size={16} aria-hidden="true" /></Link>
      </section>
    </div>
  );
}