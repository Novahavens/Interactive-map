"use client";

import { ChevronDown } from "lucide-react";
import { dateShort, money, num } from "@/lib/utils";
import type { ClaimBrief as Brief } from "@/lib/types";

const has = (v: unknown) => v !== null && v !== undefined && v !== "";

/**
 * What the team needs to know about the claim while choosing options, without leaving the map.
 * Deliberately no tenant phone, email or owner contact: the map URL is open to anyone with the link.
 */
export default function ClaimBrief({ name, brief }: { name: string; brief: Brief }) {
  const people = [
    ["Account manager", brief.accountManager],
    ["Searcher", brief.searcher],
    ["Coordinator", brief.coordinator],
  ].filter(([, v]) => has(v)) as [string, string][];

  const family = [
    has(brief.adults) ? `${num(brief.adults)} adult${brief.adults === 1 ? "" : "s"}` : null,
    has(brief.children) ? `${num(brief.children)} child${brief.children === 1 ? "" : "ren"}` : null,
    has(brief.pets) && Number(brief.pets) > 0 ? `${num(brief.pets)} pet${brief.pets === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  const rows: [string, string | null][] = [
    ["Status", brief.status ?? brief.group],
    ["Company", brief.company],
    ["Received", brief.receivedOn ? dateShort(brief.receivedOn) : null],
    ["Move in", brief.moveIn ? dateShort(brief.moveIn) : null],
    ["Lease", has(brief.leaseMonths) ? `${num(brief.leaseMonths)} months` : null],
    ["Family", family.length ? family.join(" · ") : null],
    ["Needs", has(brief.bedrooms) || has(brief.bathrooms) ? `${num(brief.bedrooms)} bd · ${num(brief.bathrooms)} ba` : null],
    ["FRV", has(brief.frv) ? money(brief.frv) : null],
    ["Utility cap", has(brief.utilityCap) ? money(brief.utilityCap) : null],
    ["Pets", brief.petDescription],
  ];

  return (
    <details className="group rounded-lg border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[13px] font-medium">
        <span className="truncate">Claim information</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="nh-scroll flex max-h-[34vh] flex-col gap-2 overflow-y-auto border-t border-line px-3 py-2.5 text-[13px]">
        <div className="truncate text-xs text-muted" title={name}>{name}</div>
        <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-1">
          {rows
            .filter(([, v]) => has(v))
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          {people.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {brief.specialRequests && (
          <div>
            <div className="text-xs text-muted">Notes &amp; special requests</div>
            <p className="mt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{brief.specialRequests}</p>
          </div>
        )}
      </div>
    </details>
  );
}
