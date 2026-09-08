import Link from "next/link";

export default function AdminNotFound() {
  return (
    <section className="a-recovery">
      <h1 className="a-heading">Record not found</h1>
      <p>This city or venue does not exist, or it may have been deleted. Return to the current inventory to continue.</p>
      <div className="a-actions"><Link href="/admin/cities" prefetch={false} className="a-button a-button--primary">City workspaces</Link><Link href="/admin/venues" prefetch={false} className="a-button">All venues</Link></div>
    </section>
  );
}