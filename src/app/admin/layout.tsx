import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./admin.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: { default: "Administration | Shagun", template: "%s | Shagun administration" },
  description: "Private Shagun inventory administration.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true, nosnippet: true } },
  alternates: { canonical: null },
  referrer: "same-origin",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin-root">{children}</div>;
}