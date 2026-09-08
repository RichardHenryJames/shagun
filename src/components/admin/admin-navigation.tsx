"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, MapPin } from "lucide-react";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/cities", label: "Cities", icon: MapPin },
  { href: "/admin/venues", label: "Venues", icon: Building2 },
];

export function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav className="admin-navigation" aria-label="Administration">
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={href} href={href} prefetch={false} aria-current={active ? "page" : undefined} className={`admin-nav-link${active ? " admin-nav-link--active" : ""}`}><Icon size={17} aria-hidden="true" />{label}</Link>;
      })}
    </nav>
  );
}