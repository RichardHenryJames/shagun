"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { CITY_SUGGESTION_QUERY_LIMIT, parseCitySuggestions, type CitySuggestion } from "@/lib/city-suggestions";

const SEARCH_DELAY = 250;
const REQUEST_TIMEOUT = 8_000;
type Suggestions = { query: string } & (
  | { status: "loading" | "error"; items: [] }
  | { status: "ready"; items: CitySuggestion[] }
);
type PendingSearch = { controller: AbortController; timer: ReturnType<typeof setTimeout> | null };

export function CitySearchBox({ id, label, placeholder, query = "", buttonLabel = "Search" }: {
  id: string;
  label: string;
  placeholder: string;
  query?: string;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(query);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Suggestions | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const pending = useRef<PendingSearch | null>(null);
  const listId = `${id}-suggestions`;
  const statusId = `${id}-suggestions-status`;
  const current = results?.query === text ? results : null;
  const items = open && current?.status === "ready" ? current.items : [];
  const expanded = open && items.length > 0;
  const active = expanded && activeIndex >= 0 && activeIndex < items.length ? activeIndex : -1;
  const searching = open && current?.status === "loading";

  const cancelPending = useCallback(() => {
    const work = pending.current;
    pending.current = null;
    if (work?.timer !== null && work?.timer !== undefined) clearTimeout(work.timer);
    work?.controller.abort();
  }, []);

  const dismiss = useCallback(() => {
    cancelPending();
    setOpen(false);
    setActiveIndex(-1);
    // Retain only error guidance, so Tab can reach Retry after the native submit
    // button. Results are discarded, not cached for the next focus or query.
    setResults((previous) => previous?.status === "error" ? previous : null);
  }, [cancelPending]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !form.current?.contains(event.target)) dismiss();
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      cancelPending();
    };
  }, [cancelPending, dismiss]);

  const search = (rawQuery: string, delay: number) => {
    cancelPending();
    setText(rawQuery);
    setOpen(true);
    setActiveIndex(-1);
    if (rawQuery.length > CITY_SUGGESTION_QUERY_LIMIT) {
      setResults({ query: rawQuery, status: "error", items: [] });
      return;
    }
    setResults({ query: rawQuery, status: "loading", items: [] });
    const work: PendingSearch = { controller: new AbortController(), timer: null };
    pending.current = work;
    // Use request identity AND the untrimmed input. A trailing-space edit,
    // dismissal, retry or unmount must invalidate even an identical search.
    const isCurrent = () => pending.current === work && !work.controller.signal.aborted && input.current?.value === rawQuery;
    const load = async () => {
      if (!isCurrent()) return;
      try {
        const response = await fetch(`/api/cities/suggestions?q=${encodeURIComponent(rawQuery)}`, {
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          headers: { Accept: "application/json" },
          signal: AbortSignal.any([work.controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT)]),
        });
        if (!response.ok) throw new Error("city_suggestions_unavailable");
        const suggestions = parseCitySuggestions(await response.json());
        if (suggestions === null) throw new Error("invalid_city_suggestions");
        if (isCurrent()) setResults({ query: rawQuery, status: "ready", items: suggestions });
      } catch {
        // Aborted obsolete work stays silent; a timeout or an invalid/error
        // response for the current request is not an empty search result.
        if (isCurrent()) setResults({ query: rawQuery, status: "error", items: [] });
      } finally {
        if (pending.current === work) pending.current = null;
      }
    };
    work.timer = setTimeout(() => { void load(); }, delay);
  };

  const choose = (city: CitySuggestion) => {
    if (!expanded || !items.includes(city) || input.current?.value !== current?.query) return;
    dismiss();
    // Slugs come only from the validated, bounded public response. No Link
    // prefetch, account lookup, geographic snapshot or private IDs are needed.
    router.push(`/city/${encodeURIComponent(city.slug)}`);
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        search(event.currentTarget.value, 0);
      } else if (items.length) {
        const next = event.key === "ArrowDown" ? (active + 1) % items.length : active <= 0 ? items.length - 1 : active - 1;
        setActiveIndex(next);
        list.current?.children.item(next)?.scrollIntoView({ block: "nearest" });
      }
    } else if (event.key === "Escape") {
      // Prevent the native search input's Escape-to-clear behavior as well.
      event.preventDefault();
      dismiss();
    } else if (event.key === "Tab") {
      dismiss();
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(items[active]);
    }
    // Enter without an explicit highlight remains a native GET submission.
  };

  const message = current?.status === "error" ? "City suggestions are unavailable. Try again or use the search button."
    : searching ? "Searching public city guides…"
      : open && current?.status === "ready" ? current.items.length
        ? `${current.items.length} public city ${current.items.length === 1 ? "guide" : "guides"} suggested. Use the arrow keys to choose, or submit to search.`
        : text.trim() ? "No public city guides match yet." : "No public city guides are available yet."
        : "";

  return (
    <form ref={form} action="/cities" method="get" role="search" className="sh-search-form sh-city-search-form" onSubmit={dismiss}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) dismiss(); }}>
      <label htmlFor={id}>{label}</label>
      <div className="sh-city-search-anchor">
        <div className="sh-search-control">
          <Search size={20} strokeWidth={1.5} aria-hidden="true" />
          <input ref={input} id={id} name="q" type="search" role="combobox" value={text}
            maxLength={CITY_SUGGESTION_QUERY_LIMIT} placeholder={placeholder} autoComplete="off" spellCheck={false}
            aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined} aria-describedby={statusId} aria-busy={searching}
            onFocus={(event) => search(event.currentTarget.value, 0)} onChange={(event) => search(event.currentTarget.value, SEARCH_DELAY)}
            onBlur={(event) => { if (!list.current?.contains(event.relatedTarget)) dismiss(); }} onKeyDown={keyDown} />
          <button className="sh-button sh-button-primary" type="submit">{buttonLabel}<ArrowRight size={17} aria-hidden="true" /></button>
        </div>
        <ul ref={list} id={listId} className="sh-city-search-options" role="listbox" aria-label="City suggestions" hidden={!expanded}>
          {items.map((city, index) => (
            <li key={city.slug} id={`${listId}-${index}`} className="sh-city-search-option" role="option"
              aria-label={`${city.name}, ${city.state}`} aria-selected={active === index} tabIndex={-1}
              // Only mouse focus transfer is suppressed, including a tap's
              // compatibility mouse event. Touch/pointer scrolling stays native.
              onMouseDown={(event) => { if (event.button === 0) event.preventDefault(); }} onClick={() => choose(city)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(city); }
                else if (event.key === "Escape") { event.preventDefault(); input.current?.focus(); dismiss(); }
              }}>
              <strong>{city.name}</strong><span>{city.state}</span>
            </li>
          ))}
        </ul>
      </div>
      <p id={statusId} role="status" aria-live="polite" aria-atomic="true"
        className={message && !expanded ? "sh-city-search-status" : "sh-sr-only"}>{message}</p>
      {current?.status === "error" && (
        <button className="sh-button sh-button-secondary sh-city-search-retry" type="button" onClick={() => {
          const control = input.current;
          if (!control) return;
          if (document.activeElement === control) search(control.value, 0);
          else control.focus();
        }}>Retry city suggestions</button>
      )}
    </form>
  );
}