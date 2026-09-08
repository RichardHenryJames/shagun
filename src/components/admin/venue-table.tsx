import Link from "next/link";
import { formatDate, formatNumber, isStale, phoneHref } from "@/lib/format";
import { VENUE_TYPE_LABELS, type PublicVenue } from "@/lib/types";
import { StatusBadge } from "@/components/admin/status-badge";

export function VenueTable({ venues, showCity = true, recent = false }: { venues: PublicVenue[]; showCity?: boolean; recent?: boolean }) {
  return (
    <div className="a-min-w-0">
      <p className="a-table-hint">Scroll the table horizontally for contact, verification and actions.</p>
      <div className="a-table-wrap" tabIndex={0} role="region" aria-label={recent ? "Recently added venues" : "Venue inventory"}>
        <table className="a-table a-venue-table">
          <caption className="a-sr-only">Saved venues. Publication and verification are separate statuses.</caption>
          <thead><tr><th scope="col">Venue</th>{showCity && <th scope="col">City</th>}<th scope="col">Publication</th><th scope="col">Phone</th><th scope="col" className="a-numeric">Photos</th><th scope="col">Verification</th><th scope="col">{recent ? "Added" : "Updated"}</th><th scope="col">Actions</th></tr></thead>
          <tbody>{venues.map((venue) => {
            const edit = `/admin/venues/${encodeURIComponent(venue.id)}`;
            const date = recent ? venue.created_at : venue.updated_at;
            return (
              <tr key={venue.id}>
                <th scope="row"><Link className="a-table-name" href={edit} prefetch={false}>{venue.name}</Link><span className="a-table-secondary">{VENUE_TYPE_LABELS[venue.venue_type]}{venue.locality ? ` · ${venue.locality}` : ""}</span></th>
                {showCity && <td><Link className="a-table-action" href={`/admin/cities/${encodeURIComponent(venue.city.slug)}`} prefetch={false}>{venue.city.name}</Link></td>}
                <td><StatusBadge status={venue.status} />{venue.status === "published" && venue.city.status !== "active" && <span className="a-table-secondary">City is not active</span>}</td>
                <td>{venue.phone ? <a className="a-table-action a-phone" href={phoneHref(venue.phone)}>{venue.phone}</a> : <span className="a-muted">Not recorded</span>}</td>
                <td className="a-numeric">{formatNumber(venue.photos.length)}</td>
                <td><StatusBadge status={venue.verification_status} />{venue.verified_at && <span className="a-table-secondary">Checked {formatDate(venue.verified_at)}</span>}{venue.verification_status === "verified" && isStale(venue.verified_at) && <span className="a-table-secondary a-warning-text">Recheck due</span>}</td>
                <td><time className="a-date" dateTime={date}>{formatDate(date) ?? "Not recorded"}</time></td>
                <td><div className="a-row-actions"><Link className="a-table-action" href={edit} prefetch={false} aria-label={`Edit ${venue.name}`}>Edit</Link><Link className="a-table-action" href={`${edit}/preview`} prefetch={false} aria-label={`Preview saved ${venue.name}`}>Preview</Link></div></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}