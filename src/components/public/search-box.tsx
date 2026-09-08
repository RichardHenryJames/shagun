import type { ReactNode } from "react";
import { ArrowRight, Search } from "lucide-react";

export function SearchBox({
  action,
  query = "",
  id,
  label,
  placeholder,
  buttonLabel = "Search",
  children,
}: {
  action: string;
  query?: string;
  id: string;
  label: string;
  placeholder: string;
  buttonLabel?: string;
  children?: ReactNode;
}) {
  return (
    <form action={action} method="get" role="search" className="sh-search-form">
      {children}
      <label htmlFor={id}>{label}</label>
      <div className="sh-search-control">
        <Search size={20} strokeWidth={1.5} aria-hidden="true" />
        <input key={query} id={id} name="q" type="search" defaultValue={query} maxLength={100} placeholder={placeholder} autoComplete="off" />
        <button className="sh-button sh-button-primary" type="submit">{buttonLabel}<ArrowRight size={17} aria-hidden="true" /></button>
      </div>
    </form>
  );
}