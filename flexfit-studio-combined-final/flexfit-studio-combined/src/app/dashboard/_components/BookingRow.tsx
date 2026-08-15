import { formatDateTime } from "@/lib/format";
import type { RouterOutputs } from "@/lib/trpc-types";

export type DashboardBooking = RouterOutputs["bookings"]["mine"][number];

export function BookingRow({
  booking,
  cancelPending,
  onCancel,
  onReschedule,
}: {
  booking: DashboardBooking;
  cancelPending: boolean;
  onCancel: (bookingId: number) => void;
  onReschedule: (booking: DashboardBooking) => void;
}) {
  // The backend allows rescheduling out of a "waitlisted" spot as well as
  // a "booked" one - only "cancel" needs to be hidden once a booking is
  // no longer active.
  const isActive = booking.status === "booked" || booking.status === "waitlisted";

  return (
    <div className="panel flex items-center gap-2 p-4 flex-wrap sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{booking.className}</h3>
          <span className="muted text-xs uppercase tracking-wide">
            {booking.status}
          </span>
        </div>
        <p className="muted mt-0.5 text-sm">
          {formatDateTime(booking.startsAt)} &middot; {booking.room}
        </p>
      </div>

      {isActive && (
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            className="btn text-sm flex-1 sm:flex-none"
            disabled={cancelPending}
            onClick={() => onReschedule(booking)}
          >
            Reschedule
          </button>
          <button
            className="btn text-sm flex-1 sm:flex-none"
            disabled={cancelPending}
            onClick={() => onCancel(booking.id)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
