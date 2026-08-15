import { formatDate, formatDateTime } from "@/lib/format";
import type { RouterOutputs } from "@/lib/trpc-types";

type RescheduleHistory = RouterOutputs["reschedules"]["history"];

export function RescheduleHistoryList({ history }: { history: RescheduleHistory | undefined }) {
  if (!history?.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-medium">Reschedule history</h2>
      <div className="space-y-2">
        {history.map((r) => (
          <div key={r.id} className="panel p-4">
            <div className="text-sm">
              <p className="font-medium">{r.fromClassName}</p>
              <p className="muted text-xs mt-1">
                From: {formatDateTime(r.fromClassTime ?? "")} • {r.fromClassRoom}
              </p>
              <p className="muted text-xs">
                To: {formatDateTime(r.toClassTime ?? "")} • {r.toClassRoom}
              </p>
              <p className="muted text-xs mt-1">
                Rescheduled {formatDate(r.rescheduledAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
