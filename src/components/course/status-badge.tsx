import clsx from "clsx";
import type { DisplayStatusDTO } from "@/lib/schemas/dto";

const LABEL: Record<DisplayStatusDTO, string> = {
  not_assessed: "Not assessed",
  developing: "Developing",
  demonstrated: "Demonstrated",
  review_due: "Review due",
};

export function StatusBadge({ status }: { status: DisplayStatusDTO }) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs",
        status === "not_assessed" && "bg-surface text-muted",
        status === "developing" && "bg-warn-soft text-warn",
        status === "demonstrated" && "bg-good-soft text-good",
        status === "review_due" && "bg-accent-soft text-accent-strong",
      )}
    >
      {LABEL[status]}
    </span>
  );
}
