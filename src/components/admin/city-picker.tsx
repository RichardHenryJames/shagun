"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { z } from "zod";
import { geoCitySchema, MAX_CATALOG_QUERY, type GeoCity } from "@/lib/city-catalog-data";
import { FieldErrors } from "@/components/admin/form-fields";

// This pure schema module contains no snapshot. Only bounded API responses,
// never the master JSON or its server-only search index, reach the browser.
const RESULT_LIMIT = 12;
const SEARCH_DELAY = 300;
const responseSchema = z.object({
  items: z.array(geoCitySchema).max(RESULT_LIMIT), total: z.number().int().nonnegative(),
  states: z.array(z.object({ code: z.string().regex(/^IN\.[A-Za-z0-9_-]{1,20}$/), name: z.string().min(1).max(200) })).min(1).max(100)
    .refine((states) => new Set(states.map((state) => state.code)).size === states.length),
  source: z.object({ name: z.literal("GeoNames"), license: z.literal("CC BY 4.0"), url: z.literal("https://www.geonames.org/") }),
}).refine((response) => response.total >= response.items.length && new Set(response.items.map((city) => city.id)).size === response.items.length);
type CatalogResponse = z.infer<typeof responseSchema>;
type Results = { key: string; items: GeoCity[]; total: number; error?: string };

async function fetchCatalog(parameters: URLSearchParams, signal: AbortSignal): Promise<CatalogResponse> {
  const response = await fetch(`/api/admin/city-catalog?${parameters}`, {
    credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });
  if (response.status === 401 || response.status === 403) throw new Error("Sign in again to search the city catalog.");
  if (!response.ok) throw new Error("The city catalog is temporarily unavailable. Try again or use manual entry.");
  return responseSchema.parse(await response.json());
}

function catalogError(error: unknown): string {
  return error instanceof Error && error.message === "Sign in again to search the city catalog."
    ? error.message : "The city catalog is temporarily unavailable. Try again or use manual entry.";
}

export function CityPicker({ value, onChange, errors, disabled = false }: {
  value: GeoCity | null; onChange: (city: GeoCity | null) => void; errors?: string[]; disabled?: boolean;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [stateCode, setStateCode] = useState(value?.stateCode ?? "");
  const [catalog, setCatalog] = useState<Pick<CatalogResponse, "states" | "source"> | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [optionsRetry, setOptionsRetry] = useState(0);
  const [searchRevision, setSearchRevision] = useState(0);
  const [results, setResults] = useState<Results | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const id = "city-catalog-query";
  const listId = `${id}-results`;
  const searchQuery = query.trim();
  const searchKey = JSON.stringify([searchQuery, stateCode, searchRevision]);
  const current = results?.key === searchKey ? results : null;
  const items = value || disabled ? [] : current?.items ?? [];
  const searching = !value && !disabled && searchQuery.length >= 2 && !current;
  const expanded = open && items.length > 0;
  const active = expanded && activeIndex >= 0 && activeIndex < items.length ? activeIndex : -1;

  useEffect(() => {
    const controller = new AbortController();
    void fetchCatalog(new URLSearchParams({ limit: String(RESULT_LIMIT) }), controller.signal).then((response) => {
      if (!controller.signal.aborted) { setCatalog({ states: response.states, source: response.source }); setOptionsError(""); }
    }).catch((error: unknown) => { if (!controller.signal.aborted) setOptionsError(catalogError(error)); });
    return () => controller.abort();
  }, [optionsRetry]);

  useEffect(() => {
    if (value || disabled || searchQuery.length < 2) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const timer = setTimeout(() => {
      if (controller.signal.aborted) return;
      const parameters = new URLSearchParams({ q: searchQuery, limit: String(RESULT_LIMIT) });
      if (stateCode) parameters.set("state", stateCode);
      void fetchCatalog(parameters, controller.signal).then((response) => {
        if (controller.signal.aborted) return;
        // Reject inconsistent responses instead of presenting another state's
        // places under the chosen filter. The save action revalidates the ID.
        if (stateCode && response.items.some((city) => city.stateCode !== stateCode)) throw new Error("catalog_state_mismatch");
        setCatalog({ states: response.states, source: response.source });
        setResults({ key: searchKey, items: response.items, total: response.total });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setResults({ key: searchKey, items: [], total: 0, error: catalogError(error) });
      });
    }, SEARCH_DELAY);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [searchQuery, stateCode, searchKey, value, disabled]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) { setOpen(false); setActiveIndex(-1); }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  useEffect(() => {
    if (active >= 0) list.current?.children.item(active)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (city: GeoCity) => {
    activeRequest.current?.abort();
    onChange(city);
    setQuery(city.name);
    setStateCode(city.stateCode);
    setOpen(false);
    setActiveIndex(-1);
    setResults(null);
    input.current?.focus();
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (items.length) setActiveIndex(event.key === "ArrowDown" ? (active + 1) % items.length : active <= 0 ? items.length - 1 : active - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter") {
      // Enter selects an explicitly highlighted result, never the parent save
      // action or the first similarly named place by accident.
      event.preventDefault();
      if (active >= 0) choose(items[active]);
      else if (!value) setOpen(true);
    }
  };
  const message = value ? `Selected ${value.name}, ${value.state}, ${value.country}.`
    : current?.error ? current.error
      : searching ? "Searching the city catalog…"
        : searchQuery.length < 2 ? "Type at least 2 characters, then choose a result. Arrow keys move between results; Enter selects; Escape closes."
          : current && current.total === 0 ? "No catalog cities match. Change the state or search, or use manual entry."
            : current ? `${current.total} matching places. Showing ${current.items.length}${current.total > current.items.length ? "; type more to narrow the results" : ""}.` : "";

  return (
    <div className="a-city-picker" ref={root} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActiveIndex(-1); }
    }}>
      <div className="a-form-grid">
        <div className="a-field">
          <label htmlFor="city-catalog-state">Filter by state / union territory</label>
          <select className="a-input" id="city-catalog-state" value={stateCode} disabled={disabled || !catalog} aria-describedby="city-catalog-state-hint" onChange={(event) => {
            activeRequest.current?.abort();
            setStateCode(event.target.value);
            setSearchRevision((revision) => revision + 1);
            setActiveIndex(-1);
            setResults(null);
            setOpen(true);
            onChange(null);
          }}>
            <option value="">All states and union territories</option>
            {catalog?.states.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
          </select>
          <p className="a-field-hint" id="city-catalog-state-hint">{catalog ? `${catalog.states.length} source-listed states and union territories. This filter does not change the saved city's state.` : optionsError || "Loading state options…"}</p>
          {!catalog && optionsError && <button className="a-button" type="button" disabled={disabled} onClick={() => { setOptionsError(""); setOptionsRetry((retry) => retry + 1); }}>Retry state options</button>}
        </div>
        <div className="a-field a-city-combobox">
          <label htmlFor={id}>Search the city catalog</label>
          <input ref={input} id={id} className="a-input" type="text" role="combobox" autoComplete="off" spellCheck={false} maxLength={MAX_CATALOG_QUERY}
            value={query} disabled={disabled} aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined} aria-invalid={errors?.length ? true : undefined}
            aria-describedby={`${id}-hint ${id}-status${errors?.length ? ` ${id}-error` : ""}`} aria-busy={searching}
            onFocus={() => setOpen(true)} onKeyDown={keyDown} onChange={(event) => {
              activeRequest.current?.abort();
              setQuery(event.target.value.replace(/\p{Cc}/gu, "").slice(0, MAX_CATALOG_QUERY));
              // A whitespace-only edit can have the same trimmed query. Give
              // every cancellation a new request key so it cannot strand the UI.
              setSearchRevision((revision) => revision + 1);
              setActiveIndex(-1);
              setResults(null);
              setOpen(true);
              onChange(null);
            }} />
          <p id={`${id}-hint`} className="a-field-hint">Search names, source aliases or districts. Check the state and district before selecting; names can repeat.</p>
          <ul ref={list} id={listId} className="a-city-options" role="listbox" aria-label="Matching catalog cities" hidden={!expanded}>
            {items.map((city, index) => <li key={city.id} id={`${listId}-${index}`} role="option" aria-selected={active === index} tabIndex={-1}
              onPointerDown={(event) => event.preventDefault()} onClick={() => choose(city)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(city); } }}>
              <strong>{city.name}</strong><span>{city.state}, {city.country}{city.district ? ` · District: ${city.district}` : " · District not recorded"}</span><small>{city.id}</small>
            </li>)}
          </ul>
          <FieldErrors id={id} errors={errors} />
        </div>
      </div>
      <p className="a-field-hint a-city-picker-status" id={`${id}-status`} role="status" aria-live="polite" aria-atomic="true">{message}</p>
      {current?.error && !value && <button className="a-button" type="button" disabled={disabled} onClick={() => { setResults(null); setOpen(true); setSearchRevision((revision) => revision + 1); }}>Retry city search</button>}
      {value && <p className="a-inline-value">Geographic source: <strong>{value.name}</strong> · {value.state}, {value.country}{value.district ? ` · District: ${value.district}` : ""}<br /><span className="a-field-hint">{value.id} · Edit the display name and available URL below. The source association becomes fixed after saving.</span></p>}
      <p className="a-field-hint a-city-attribution">Geographical data © <a className="a-link" href={catalog?.source.url ?? "https://www.geonames.org/"} target="_blank" rel="noopener noreferrer">GeoNames<span className="a-sr-only"> (opens in a new tab)</span></a>, licensed under <a className="a-link" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0<span className="a-sr-only"> (opens in a new tab)</span></a>. Source-derived names and aliases; not launched Shagun inventory or a completeness claim.</p>
    </div>
  );
}