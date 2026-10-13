// Relocation-specialist summary (F4). Pure: data in, subject/text/html out, so it can be unit-tested
// and rendered identically for the preview, the clipboard and the Monday update.
// The HTML sticks to tags Monday updates and mail clients both keep: p, b, a, br, ul, li.

import type { ClaimNeeds, PropertyDetail } from "./types";

export interface SummaryOption {
  detail: PropertyDetail;
  distanceMiles: number | null;
}

export interface SummaryInput {
  claim: { id: string; name: string; lossAddress: string | null; needs: ClaimNeeds };
  options: SummaryOption[];
  preparedAt: Date;
}

export interface Summary {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Zero means "not priced" in the property mirror, so it is left out rather than shown as $0.
const usd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) || Number(n) === 0 ? null : `$${Math.round(Number(n)).toLocaleString("en-US")}`;

/** Free-text fields use "N/D" (not determined) for blanks. */
const txt = (s: string | null | undefined) => (s && !/^\s*n\/?d\s*$/i.test(s) ? s.trim() : null);

const n1 = (n: number | null | undefined) => (n == null ? null : Number.isInteger(n) ? String(n) : n.toFixed(1));

const day = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function needsLine(n: ClaimNeeds): string {
  const parts = [
    n.adults != null ? `${n1(n.adults)} adult${n.adults === 1 ? "" : "s"}` : null,
    n.children != null ? `${n1(n.children)} child${n.children === 1 ? "" : "ren"}` : null,
    n.bedrooms != null ? `${n1(n.bedrooms)} bed` : null,
    n.bathrooms != null ? `${n1(n.bathrooms)} bath` : null,
    n.pets != null ? `${n1(n.pets)} pet${n.pets === 1 ? "" : "s"}` : null,
    n.frv != null ? `FRV ${usd(n.frv)}` : null,
    n.moveIn ? `move-in ${day(n.moveIn)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Not stated on the claim";
}

function address(d: PropertyDetail): string {
  const cityLine = [d.city, [d.state, d.zipcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  let line: string;
  if (!d.address) line = d.name || cityLine || "Property";
  // Some records already carry the city in the street field; don't repeat it.
  else line = d.city && !d.address.toLowerCase().includes(d.city.toLowerCase()) ? `${d.address}, ${cityLine}` : d.address;
  // Say so rather than let a city read as an address the family can drive to.
  return d.location_precision === "approximate" ? `${line} (approximate area; street address to be confirmed with the host)` : line;
}

/** [label, value] rows for one option; rows with no value are dropped. */
function optionRows(o: SummaryOption): Array<[string, string]> {
  const d = o.detail;
  const fees: Array<[string, number | null]> = [
    ["Security deposit", d.security_deposit],
    ["Pet deposit", d.pet_deposit],
    ["Pet fee", d.pet_fee],
    ["Pet rent", d.pet_rent],
    ["Application fee", d.application_fee],
    ["Admin fee", d.admin_fee],
    ["Cleaning fee", d.cleaning_fee],
    ["Move-in fee", d.move_in_fee],
    [d.other_fee_1_desc || "Other fee", d.other_fee_1],
    [d.other_fee_2_desc || "Other fee", d.other_fee_2],
  ];
  const rows: Array<[string, string | null]> = [
    ["Beds / baths", d.bedrooms != null || d.bathrooms != null ? `${n1(d.bedrooms) ?? "—"} bd / ${n1(d.bathrooms) ?? "—"} ba` : null],
    ["Type", txt(d.property_type)],
    ["Furnished", txt(d.furnished)],
    ["Pets", txt(d.pet_status)],
    ["Monthly rent", usd(d.monthly_rate)],
    ...fees.map(([k, v]) => [k, usd(v)] as [string, string | null]),
    ["Move-in total", usd(d.move_in_total)],
    ["Distance to loss", o.distanceMiles != null ? `${o.distanceMiles.toFixed(1)} mi` : null],
    ["Available", day(d.next_availability)],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}

export function buildSummary({ claim, options, preparedAt }: SummaryInput): Summary {
  const sorted = [...options].sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
  const count = `${sorted.length} housing option${sorted.length === 1 ? "" : "s"}`;
  const subject = `${count} for ${claim.name}`;
  const needs = needsLine(claim.needs);
  const date = day(preparedAt.toISOString());

  // ---- plain text ----
  const t: string[] = [
    `${count} for ${claim.name}`,
    `Loss address: ${claim.lossAddress ?? "—"}`,
    `Family needs: ${needs}`,
    `Prepared ${date}`,
    "",
  ];
  sorted.forEach((o, i) => {
    t.push(`${i + 1}. ${address(o.detail)}`);
    for (const [k, v] of optionRows(o)) t.push(`   ${k}: ${v}`);
    if (o.detail.property_link) t.push(`   Listing: ${o.detail.property_link}`);
    if (o.detail.photo_folder_url) t.push(`   Photos: ${o.detail.photo_folder_url}`);
    t.push("");
  });
  t.push("Prepared with the Nova Havens Property Map");

  // ---- HTML ----
  const link = (href: string, label: string) => `<a href="${esc(href)}">${esc(label)}</a>`;
  const h: string[] = [
    `<p><b>${esc(count)} for ${esc(claim.name)}</b><br>`,
    `Loss address: ${esc(claim.lossAddress ?? "—")}<br>`,
    `Family needs: ${esc(needs)}<br>`,
    `Prepared ${esc(date ?? "")}</p>`,
  ];
  sorted.forEach((o, i) => {
    const links = [
      o.detail.property_link ? link(o.detail.property_link, "Listing") : null,
      o.detail.photo_folder_url ? link(o.detail.photo_folder_url, "Photos") : null,
    ].filter(Boolean);
    h.push(`<p><b>${i + 1}. ${esc(address(o.detail))}</b></p>`);
    h.push(`<ul>${optionRows(o).map(([k, v]) => `<li>${esc(k)}: ${k === "Move-in total" ? `<b>${esc(v)}</b>` : esc(v)}</li>`).join("")}</ul>`);
    if (links.length) h.push(`<p>${links.join(" · ")}</p>`);
  });
  h.push(`<p>Prepared with the Nova Havens Property Map</p>`);

  return { subject, text: t.join("\n"), html: h.join("") };
}

/** Pulls every address out of a mirror cell such as "perickson@crsth.com - dharper@crsth.com". */
export function parseEmails(s: string | null | undefined): string[] {
  return Array.from(new Set((s ?? "").match(/[^\s,;<>()]+@[^\s,;<>()]+\.[a-z]{2,}/gi) ?? []));
}
