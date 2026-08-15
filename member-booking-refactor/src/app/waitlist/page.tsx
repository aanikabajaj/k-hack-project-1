"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";
import { ErrorBanner, SuccessBanner } from "@/components/ui/Banner";
import { RescheduleModal } from "@/components/reschedule-modal";

interface RescheduleTarget {
  bookingId: number;
  classId: number;
  className: string;
  startsAt: string;
}

export default function WaitlistPage() {
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: waitlisted, isLoading } = trpc.bookings.waitlisted.useQuery();
  const cancel = trpc.bookings.cancel.useMutation({
    onSuccess: async () => {
      await utils.bookings.waitlisted.invalidate();
      await utils.bookings.mine.invalidate();
      await utils.classes.list.invalidate();
    },
  });

  if (isLoading) return <p className="muted">Loading...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Waitlist</h1>
        <p className="muted mt-1 text-sm">
          Classes you're waitlisted for
        </p>
      </div>

      {successMessage && <SuccessBanner message={successMessage} />}
      {cancel.error && <ErrorBanner message={cancel.error.message} />}

      {waitlisted?.length ? (
        <div className="space-y-2">
          {waitlisted.map((w) => (
            <div key={w.bookingId} className="panel flex items-center gap-4 p-4 flex-wrap sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{w.className}</h3>
                  <span
                    className="rounded px-2 py-1 text-xs font-medium"
                    style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                  >
                    #{w.position} in queue
                  </span>
                </div>
                <p className="muted mt-0.5 text-sm">
                  {formatDateTime(w.startsAt)} &middot; {w.room} &middot; {w.durationMin} min
                </p>
              </div>

              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  className="btn text-sm flex-1 sm:flex-none"
                  disabled={cancel.isPending}
                  onClick={() =>
                    setRescheduleTarget({
                      bookingId: w.bookingId,
                      classId: w.classId,
                      className: w.className,
                      startsAt: w.startsAt,
                    })
                  }
                >
                  Reschedule
                </button>
                <button
                  className="btn text-sm flex-1 sm:flex-none"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate({ bookingId: w.bookingId })}
                >
                  Leave waitlist
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted text-sm">You're not waitlisted for any classes.</p>
      )}

      <RescheduleModal
        isOpen={rescheduleTarget !== null}
        onClose={() => setRescheduleTarget(null)}
        fromBookingId={rescheduleTarget?.bookingId ?? 0}
        fromClassId={rescheduleTarget?.classId ?? 0}
        fromClassName={rescheduleTarget?.className ?? ""}
        fromClassTime={rescheduleTarget?.startsAt ?? ""}
        onSuccess={() => {
          setSuccessMessage("Class rescheduled successfully!");
          setTimeout(() => setSuccessMessage(null), 3000);
        }}
      />
    </div>
  );
}
