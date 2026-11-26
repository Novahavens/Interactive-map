"use client";

// Dev-only preview of the Contacts extras (pillar F): Find phone, Text templates, the outreach line.
// "Every state" is drawn from fixed data, with no requests. "Live" uses the real components against the
// real routes (tests/browser/contacts.mjs mocks them per property id). Fictional data only.
import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import ContactActions from "@/components/property/ContactActions";
import FindPhone, { FindPhoneView } from "@/components/property/FindPhone";
import OutreachLine from "@/components/property/OutreachLine";
import type { PhoneState } from "@/lib/phone-lookup-ui";
import type { OutreachStatus } from "@/lib/types";

const NAME = "Marisol Example";
const ADDRESS = "1418 Juniper Ct, Tulsa, OK 74133, USA";
const CONTEXT = { beds: 3, city: "Tulsa", moveIn: "2026-12-08", rent: 3350 };
const FOUND = { phone: "+19185550142", source: "lookup", lookedUpAt: "2026-11-26T15:10:00.000Z" };
const SENT: OutreachStatus = { status: "sent", channel: "ff_message", sentAt: "2026-11-24T18:30:00.000Z", sentBy: "Alex Example", repliedAt: null };
const REPLIED: OutreachStatus = { ...SENT, status: "replied", repliedAt: "2026-11-25T15:12:00.000Z" };

const VIEWS: { tag: string; state: PhoneState; save?: "saving" | "saved" | "failed" }[] = [
  { tag: "Idle", state: { kind: "idle" } },
  { tag: "Searching", state: { kind: "searching" } },
  { tag: "Found · high", state: { kind: "found", ...FOUND, confidence: "high" } },
  { tag: "Found · medium", state: { kind: "found", ...FOUND, confidence: "medium" } },
  { tag: "Found · low", state: { kind: "found", ...FOUND, confidence: "low" } },
  { tag: "Found · saving", state: { kind: "found", ...FOUND, confidence: "high" }, save: "saving" },
  { tag: "Found · save failed", state: { kind: "found", ...FOUND, confidence: "high" }, save: "failed" },
  { tag: "Not found · checked earlier", state: { kind: "not_found", lookedUpAt: "2026-11-20T15:10:00.000Z" } },
  { tag: "Not found · checked today", state: { kind: "not_found", lookedUpAt: new Date().toISOString() } },
  { tag: "Off", state: { kind: "off" } },
  { tag: "Error", state: { kind: "error", busy: false } },
  { tag: "Too many lookups (429)", state: { kind: "error", busy: true } },
];

/** Live Find phone cases: the browser test answers each property id differently. */
const LIVE: { id: string; tag: string }[] = [
  { id: "9900000401", tag: "idle" },
  { id: "9900000402", tag: "found" },
  { id: "9900000403", tag: "found-low" },
  { id: "9900000404", tag: "not-found" },
  { id: "9900000405", tag: "off" },
  { id: "9900000406", tag: "error" },
  { id: "9900000407", tag: "busy" },
  { id: "9900000408", tag: "provider-off" },
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="w-full max-w-[388px] rounded-lg border border-line bg-surface">
      <h2 className="border-b border-line px-4 py-2 text-[13px] font-semibold text-ink">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Case({ tag, id, children }: { tag: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-line px-4 py-3 last:border-b-0" data-case={id}>
      <span className="nh-eyebrow">{tag}</span>
      {children}
    </div>
  );
}

export default function ContactsPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  // Dates are worded in the device's time zone, so everything is drawn after mount.
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState("");
  useEffect(() => setReady(true), []);
  if (!ready) return null;

  const save = (id: string) => (phone: string) =>
    new Promise<void>((resolve, reject) =>
      setTimeout(() => {
        if (id === "9900000403") return reject(new Error("demo: the save failed"));
        setSaved(`${id}:${phone}`);
        resolve();
      }, 400),
    );

  return (
    <main className="min-h-dvh bg-bg p-3 text-[13px] text-ink sm:p-6">
      <h1 className="mb-1 text-base font-semibold">Contacts: find phone, text templates, outreach</h1>
      <p className="mb-4 text-xs text-muted">Dev preview. Fictional data. Not in production builds.</p>
      <output className="sr-only" data-saved>
        {saved}
      </output>
      <div className="flex flex-wrap items-start gap-4">
        <Card title="Find phone · every state">
          {VIEWS.map((v) => (
            <Case key={v.tag} tag={v.tag} id={`view-${v.tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
              <FindPhoneView state={v.state} name={NAME} address={ADDRESS} save={v.save} onSave={() => {}} />
            </Case>
          ))}
        </Card>

        <Card title="Text templates · outreach line">
          <Case tag="Templates on · rent and move-in known" id="templates">
            <ContactActions phone="(918) 555-0142" name={NAME} address={ADDRESS} templates templateContext={CONTEXT} />
            <OutreachLine enabled outreach={SENT} />
          </Case>
          <Case tag="Templates on · nothing else known · two numbers" id="templates-bare">
            <ContactActions phone="(918) 555-0100 / 918-555-0199" name="Acme Properties LLC" address={null} templates />
            <OutreachLine enabled outreach={REPLIED} />
          </Case>
          <Case tag="Templates off · today's Text link" id="plain">
            <ContactActions phone="(918) 555-0142" name={NAME} address={ADDRESS} />
          </Case>
          <Case tag="Outreach · asked" id="outreach-asked">
            <OutreachLine enabled outreach={SENT} />
          </Case>
          <Case tag="Outreach · replied" id="outreach-replied">
            <OutreachLine enabled outreach={REPLIED} />
          </Case>
          <Case tag="Outreach · nothing sent (no line)" id="outreach-none">
            <OutreachLine enabled outreach={null} />
          </Case>
        </Card>

        <Card title="Live · real routes">
          {LIVE.map((c) => (
            <Case key={c.id} tag={`Find phone · ${c.tag}`} id={`live-${c.tag}`}>
              <FindPhone propertyId={c.id} name={NAME} address={ADDRESS} enabled onSave={save(c.id)} />
            </Case>
          ))}
          <Case tag="Find phone · no save handler" id="live-nosave">
            <FindPhone propertyId="9900000409" name={NAME} address={ADDRESS} enabled />
          </Case>
          <Case tag="Find phone · flag off (nothing)" id="live-disabled">
            <FindPhone propertyId="9900000410" name={NAME} address={ADDRESS} enabled={false} />
          </Case>
          <Case tag="Outreach · asked" id="live-outreach-asked">
            <OutreachLine propertyId="9900000501" enabled />
          </Case>
          <Case tag="Outreach · replied" id="live-outreach-replied">
            <OutreachLine propertyId="9900000502" enabled />
          </Case>
          <Case tag="Outreach · none" id="live-outreach-none">
            <OutreachLine propertyId="9900000503" enabled />
          </Case>
          <Case tag="Outreach · route says off" id="live-outreach-off">
            <OutreachLine propertyId="9900000504" enabled />
          </Case>
          <Case tag="Outreach · flag off (no request)" id="live-outreach-disabled">
            <OutreachLine propertyId="9900000505" enabled={false} />
          </Case>
        </Card>
      </div>
    </main>
  );
}
