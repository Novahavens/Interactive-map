import { cn } from "@/lib/utils";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <h3 className="nh-eyebrow mb-2">{title}</h3>
      {children}
    </section>
  );
}

export function Fee({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const empty = value === "—";
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted">{label}</span>
      <span className={cn("font-mono", strong ? "font-semibold" : "font-normal", empty && "text-muted")}>{value}</span>
    </div>
  );
}

export function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-muted p-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted">{k}</span>
      <span>{v}</span>
    </div>
  );
}

export function LinkChip({ href, icon, label, struck }: { href: string; icon: React.ReactNode; label: string; struck?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink no-underline hover:bg-surface-muted",
        struck && "text-muted line-through",
      )}
    >
      {icon}
      {label}
    </a>
  );
}
