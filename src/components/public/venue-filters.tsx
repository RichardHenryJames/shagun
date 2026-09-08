"use client";

import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { FACILITY_LABELS, PRICE_TYPE_LABELS, VENUE_TYPE_LABELS, type Facets, type PriceType, type SearchFilters } from "@/lib/types";
import { useNativeDialog } from "@/components/public/use-native-dialog";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function FilterForm({ facets, filters, action, resetHref, id, onSubmit }: {
  facets: Facets;
  filters: SearchFilters;
  action: string;
  resetHref: string;
  id: string;
  onSubmit?: () => void;
}) {
  const [priceType, setPriceType] = useState<PriceType | "">(filters.priceType ?? "");
  const [budget, setBudget] = useState(filters.budget?.toString() ?? "");
  const [sort, setSort] = useState(filters.sort);

  return (
    <form action={action} method="get" className="sh-filter-form" onSubmit={onSubmit}>
      {filters.q && <input type="hidden" name="q" value={filters.q} />}
      {sort !== "recent" && <input type="hidden" name="sort" value={sort} />}
      {facets.venueTypes.length > 1 ? (
        <div className="sh-field">
          <label htmlFor={`${id}-type`}>Venue type</label>
          <select id={`${id}-type`} name="type" defaultValue={filters.type ?? ""}>
            <option value="">All venue types</option>
            {facets.venueTypes.map((type) => <option key={type} value={type}>{VENUE_TYPE_LABELS[type]}</option>)}
          </select>
        </div>
      ) : filters.type && <input type="hidden" name="type" value={filters.type} />}
      {facets.hasCapacity && (
        <div className="sh-field">
          <label htmlFor={`${id}-capacity`}>Guest count</label>
          <input id={`${id}-capacity`} type="number" name="capacity" min={1} max={100000} step={1} inputMode="numeric" defaultValue={filters.capacity ?? ""} placeholder="Number of guests" aria-describedby={`${id}-capacity-help`} />
          <p id={`${id}-capacity-help`} className="sh-field-hint">Find venues with a recorded capacity for your gathering.</p>
        </div>
      )}
      {facets.priceTypes.length > 0 && (
        <fieldset className="sh-price-fields">
          <legend>Budget, on the same basis</legend>
          <div className="sh-field">
            <label htmlFor={`${id}-price-type`}>Price basis</label>
            <select
              id={`${id}-price-type`}
              name="priceType"
              value={priceType}
              required={Boolean(budget) || sort === "price"}
              aria-describedby={`${id}-price-help`}
              onChange={(event) => {
                const next = event.target.value as PriceType | "";
                setPriceType(next);
                if (!next) { setBudget(""); if (sort === "price") setSort("recent"); }
              }}
            >
              <option value="">Choose a basis</option>
              {facets.priceTypes.map((type) => <option key={type} value={type}>{PRICE_TYPE_LABELS[type]}</option>)}
            </select>
          </div>
          <div className="sh-field">
            <label htmlFor={`${id}-budget`}>Maximum budget (₹)</label>
            <input id={`${id}-budget`} name="budget" type="number" min={1} max={100000000} step={1} inputMode="numeric" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Your upper limit" aria-describedby={`${id}-price-help`} />
          </div>
          <p id={`${id}-price-help`} className="sh-field-hint">Choose a price basis to use a budget or sort by price. Per-day, per-event and per-plate figures are not comparable.</p>
        </fieldset>
      )}
      {facets.facilities.length > 0 && (
        <fieldset className="sh-facility-fields">
          <legend>Recorded facilities</legend>
          {facets.facilities.map((facility) => (
            <label key={facility} className="sh-checkbox-label">
              <input type="checkbox" name="facility" value={facility} defaultChecked={filters.facilities.includes(facility)} />
              <span>{FACILITY_LABELS[facility]}</span>
            </label>
          ))}
          <p className="sh-field-hint">Only venues with the selected facilities recorded will appear.</p>
        </fieldset>
      )}
      <div className="sh-filter-actions">
        <button className="sh-button sh-button-primary" type="submit">Apply filters</button>
        <Link className="sh-text-link" href={resetHref} prefetch={false}>Clear filters</Link>
      </div>
    </form>
  );
}

export function VenueFilters({ facets, filters, action, resetHref }: {
  facets: Facets;
  filters: SearchFilters;
  action: string;
  resetHref: string;
}) {
  const id = useId();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const { dialogRef, openDialog, closeDialog, restoreFocus, dismissBackdrop } = useNativeDialog();
  const count = Number(Boolean(filters.capacity)) + Number(Boolean(filters.type)) + Number(Boolean(filters.budget)) + Number(Boolean(filters.priceType)) + filters.facilities.length;
  const formProps = { facets, filters, action, resetHref };
  const hasFacets = facets.hasCapacity || facets.facilities.length > 0 || facets.priceTypes.length > 0 || facets.venueTypes.length > 1;
  if (!hasFacets) return null;

  return (
    <div className="sh-filter-area">
      <aside className="sh-filter-desktop" aria-label="Venue filters">
        <div className="sh-filter-heading"><h2>Refine your search</h2><SlidersHorizontal size={18} aria-hidden="true" /></div>
        <FilterForm {...formProps} id={`${id}-desktop`} />
      </aside>
      {hydrated ? (
        <>
          <button type="button" className="sh-button sh-button-secondary sh-filter-trigger" onClick={(event) => openDialog(event.currentTarget)}>
            <SlidersHorizontal size={17} aria-hidden="true" />Filters{count > 0 && <span className="sh-filter-count">{count}<span className="sh-sr-only"> active</span></span>}
          </button>
          <dialog ref={dialogRef} className="sh-filter-dialog" aria-labelledby={`${id}-title`} onClose={restoreFocus} onClick={dismissBackdrop}>
            <div className="sh-filter-dialog-header">
              <div><p className="sh-eyebrow">MAKE IT YOURS</p><h2 id={`${id}-title`}>Refine your search</h2></div>
              <button type="button" className="sh-icon-button" onClick={closeDialog} aria-label="Close filters" data-dialog-focus><X size={22} aria-hidden="true" /></button>
            </div>
            <FilterForm {...formProps} id={`${id}-mobile`} onSubmit={closeDialog} />
          </dialog>
        </>
      ) : (
        <details className="sh-filter-nojs">
          <summary><SlidersHorizontal size={17} aria-hidden="true" />Filter venues</summary>
          <FilterForm {...formProps} id={`${id}-native`} />
        </details>
      )}
    </div>
  );
}