import type { ReactElement } from "react";
import { CUSTOM_COUNTRY_CODE as CUSTOM_CODE } from "../lib/countries";

/**
 * Flags as inline SVG rather than emoji.
 *
 * Windows ships no country-flag glyphs in Segoe UI Emoji, so `🇺🇿` renders in
 * Chrome and Edge as the bare regional-indicator letters "UZ". Drawing them
 * makes the control look the same on every platform.
 *
 * These are deliberate simplifications for a ~20px icon — correct colours,
 * proportions and layout, with the fine detail of the emblems reduced to what
 * survives at that size. All are normalised to a 3:2 box so the list aligns,
 * which is what icon sets do; the real ratios differ per country.
 */

const FLAGS: Record<string, ReactElement> = {
  UZ: (
    <>
      <rect fill="#0099B5" height="16" width="24" />
      <rect fill="#CE1126" height="6" width="24" y="5" />
      <rect fill="#fff" height="5.2" width="24" y="5.4" />
      <rect fill="#1EB53A" height="5" width="24" y="11" />
      <circle cx="5" cy="2.5" fill="#fff" r="1.9" />
      <circle cx="5.9" cy="2.2" fill="#0099B5" r="1.7" />
      <g fill="#fff">
        <circle cx="8.4" cy="1.1" r="0.3" />
        <circle cx="9.8" cy="1.1" r="0.3" />
        <circle cx="11.2" cy="1.1" r="0.3" />
        <circle cx="8.4" cy="2.3" r="0.3" />
        <circle cx="9.8" cy="2.3" r="0.3" />
        <circle cx="11.2" cy="2.3" r="0.3" />
        <circle cx="12.6" cy="2.3" r="0.3" />
        <circle cx="8.4" cy="3.5" r="0.3" />
        <circle cx="9.8" cy="3.5" r="0.3" />
        <circle cx="11.2" cy="3.5" r="0.3" />
        <circle cx="12.6" cy="3.5" r="0.3" />
        <circle cx="14" cy="3.5" r="0.3" />
      </g>
    </>
  ),
  KZ: (
    <>
      <rect fill="#00AFCA" height="16" width="24" />
      <g fill="#FEC50C">
        <circle cx="12.5" cy="6.4" r="2.5" />
        <path d="M7.9 11.3c2.2-1.6 3.3-1.9 4.6-1.9s2.4.3 4.6 1.9c-1.9-.7-3.1-.9-4.6-.9s-2.7.2-4.6.9z" />
        <path d="M1.9 2.6l.7.9-.7.9-.7-.9zm0 3l.7.9-.7.9-.7-.9zm0 3l.7.9-.7.9-.7-.9zm0 3l.7.9-.7.9-.7-.9z" />
      </g>
      <g fill="none" stroke="#FEC50C" strokeLinecap="round" strokeWidth="0.55">
        <path d="M12.5 2.5v1.1M12.5 9.2v1.1M8.5 6.4h1.1M15.4 6.4h1.1M9.6 3.5l.8.8M14.6 8.5l.8.8M15.4 3.5l-.8.8M10.4 8.5l-.8.8" />
      </g>
    </>
  ),
  KG: (
    <>
      <rect fill="#E8112D" height="16" width="24" />
      <circle cx="12" cy="8" fill="#FFEF00" r="3.1" />
      <g fill="none" stroke="#FFEF00" strokeLinecap="round" strokeWidth="0.55">
        <path d="M12 3.6v1.1M12 11.3v1.1M7.6 8h1.1M15.3 8h1.1M8.9 4.9l.8.8M14.3 10.3l.8.8M15.1 4.9l-.8.8M9.7 10.3l-.8.8" />
      </g>
      <g fill="none" stroke="#E8112D" strokeWidth="0.42">
        <circle cx="12" cy="8" r="1.8" />
        <path d="M10.2 8h3.6M12 6.2v3.6" />
      </g>
    </>
  ),
  TJ: (
    <>
      <rect fill="#CC0000" height="16" width="24" />
      <rect fill="#fff" height="6.9" width="24" y="4.6" />
      <rect fill="#006600" height="4.6" width="24" y="11.4" />
      <g fill="#F8C300">
        <path d="M10.2 9.3l.5-1.4.9 1 .4-1.6.4 1.6.9-1 .5 1.4z" />
        <rect height="0.5" width="3.6" x="10.2" y="9.4" />
        <circle cx="9.7" cy="7" r="0.26" />
        <circle cx="10.6" cy="6.6" r="0.26" />
        <circle cx="11.5" cy="6.35" r="0.26" />
        <circle cx="12.5" cy="6.28" r="0.26" />
        <circle cx="13.5" cy="6.35" r="0.26" />
        <circle cx="14.4" cy="6.6" r="0.26" />
        <circle cx="15.3" cy="7" r="0.26" />
      </g>
    </>
  ),
  TM: (
    <>
      <rect fill="#28AE66" height="16" width="24" />
      <rect fill="#B32134" height="16" width="3.4" x="2.8" />
      <g fill="#F0E9D8">
        <rect height="1.4" width="1.6" x="3.7" y="1.4" />
        <rect height="1.4" width="1.6" x="3.7" y="4" />
        <rect height="1.4" width="1.6" x="3.7" y="6.6" />
        <rect height="1.4" width="1.6" x="3.7" y="9.2" />
        <rect height="1.4" width="1.6" x="3.7" y="11.8" />
      </g>
      <circle cx="11.6" cy="5" fill="#fff" r="2.1" />
      <circle cx="12.5" cy="4.6" fill="#28AE66" r="1.85" />
      <g fill="#fff">
        <circle cx="14.6" cy="2.6" r="0.32" />
        <circle cx="15.8" cy="3.6" r="0.32" />
        <circle cx="16.3" cy="5" r="0.32" />
        <circle cx="15.8" cy="6.4" r="0.32" />
        <circle cx="14.6" cy="7.4" r="0.32" />
      </g>
    </>
  ),
  RU: (
    <>
      <rect fill="#fff" height="16" width="24" />
      <rect fill="#0039A6" height="5.34" width="24" y="5.33" />
      <rect fill="#D52B1E" height="5.33" width="24" y="10.67" />
    </>
  ),
  /*
   * "Somewhere else" — the option for a number this product has no flag for.
   * A globe rather than a seventh flag, drawn in `currentColor` so it reads as
   * an icon in the list rather than as a country of its own.
   */
  [CUSTOM_CODE]: (
    <g fill="none" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.1">
      <circle cx="12" cy="8" r="6" />
      <ellipse cx="12" cy="8" rx="2.6" ry="6" />
      <path d="M6.2 6h11.6M6.2 10h11.6" />
    </g>
  ),
};

interface FlagIconProperties {
  className?: string;
  /** ISO 3166-1 alpha-2. */
  code: string;
}

/**
 * Decorative: every place this is used sits next to the country name or dial
 * code, so it is hidden from assistive technology rather than duplicating them.
 */
export const FlagIcon = ({ code, className }: FlagIconProperties) => {
  const flag = FLAGS[code];

  if (!flag) {
    return null;
  }

  /*
   * The globe is not a flag and must not be boxed like one — the hairline below
   * would draw a rectangle around a circle.
   */
  if (code === CUSTOM_CODE) {
    return (
      <svg
        aria-hidden="true"
        className={className}
        focusable="false"
        role="presentation"
        viewBox="0 0 24 16"
        xmlns="http://www.w3.org/2000/svg"
      >
        {flag}
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      role="presentation"
      viewBox="0 0 24 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      {flag}
      {/* Keeps a pale flag legible against a pale surface. */}
      <rect
        fill="none"
        height="15.4"
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeWidth="0.6"
        width="23.4"
        x="0.3"
        y="0.3"
      />
    </svg>
  );
};
