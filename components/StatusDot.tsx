import { STATUS_COLOR, STATUS_LABEL, STATUS_SHAPE, type MapStatus } from "@/lib/status";

/** The one dot used everywhere (pins, list rows, panel, legend): colour plus its own shape. */
export function StatusDot({ status, className }: { status: MapStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      className={`nh-dot nh-dot--${STATUS_SHAPE[status]} ${className ?? ""}`}
      style={{ background: STATUS_COLOR[status] }}
    />
  );
}
