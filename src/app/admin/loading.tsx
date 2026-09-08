import { AdminLoading } from "@/components/admin/loading-state";

export default function Loading() {
  return <main id="main-content" className="admin-boundary" tabIndex={-1}><AdminLoading /></main>;
}