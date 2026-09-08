"use client";

import { useState } from "react";
import { searchPlaces, type UsPlace } from "@/lib/geo/places";

/**
 * "City/state via autocomplete against a real place list, not free text."
 * The only way this component can produce a value is by the caller picking
 * one of the offered suggestions - there is no path from typed text to a
 * selected place, which is what makes the server-side isValidPlace() check
 * in lib/server/validate-signup.ts a real enforcement rather than a
 * decoration this component could be bypassed around.
 */
export function CityAutocomplete({
  onSelect,
  selected,
}: {
  onSelect: (place: UsPlace | null) => void;
  selected: UsPlace | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UsPlace[]>([]);

  return (
    <div className="field">
      <label className="field-label" htmlFor="city">
        City (optional, US only)
      </label>
      {selected ? (
        <div className="controls">
          <span className="note">{selected.city}, {selected.state}</span>
          <button
            type="button"
            className="button"
            onClick={() => {
              onSelect(null);
              setQuery("");
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            id="city"
            className="field-input"
            type="text"
            autoComplete="off"
            placeholder="Start typing a city..."
            value={query}
            onChange={(e) => {
              const value = e.target.value;
              setQuery(value);
              setResults(searchPlaces(value));
            }}
          />
          {results.length > 0 ? (
            <div className="autocomplete-list" role="listbox">
              {results.map((place) => (
                <button
                  key={`${place.city}-${place.state}`}
                  type="button"
                  className="autocomplete-option"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onSelect(place);
                    setQuery("");
                    setResults([]);
                  }}
                >
                  {place.city}, {place.state}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
      <p className="note">
        Not in the US, or your city isn&apos;t listed? Leave this blank - it stays
        optional either way.
      </p>
    </div>
  );
}
