import { STATUS, type MapStatus } from "@/lib/status";

/** The one dot used everywhere (pins, list rows, panel, legend): colour plus its own shape. */
export function StatusDot({ status, className }: { status: MapStatus; className?: string }) {
  const s = STATUS[status];
  return <span role="img" aria-label={s.label} className={`nh-dot nh-dot--${s.shape} ${className ?? ""}`} style={{ background: s.color }} />;
}
