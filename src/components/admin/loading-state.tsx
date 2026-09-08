export function AdminLoading() {
  return (
    <div className="a-loading" aria-busy="true">
      <h1 className="a-heading">Loading administration</h1>
      <p className="a-muted" role="status">Checking access and loading saved inventory…</p>
      <div className="a-loading-lines" aria-hidden="true"><span /><span /><span /><span /></div>
    </div>
  );
}