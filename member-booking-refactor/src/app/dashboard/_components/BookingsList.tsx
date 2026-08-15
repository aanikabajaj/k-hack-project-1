import { BookingRow, type DashboardBooking } from "./BookingRow";

export function BookingsList({
  bookings,
  cancelPending,
  onCancel,
  onReschedule,
}: {
  bookings: DashboardBooking[] | undefined;
  cancelPending: boolean;
  onCancel: (bookingId: number) => void;
  onReschedule: (booking: DashboardBooking) => void;
}) {
  if (!bookings?.length) {
    return <p className="muted text-sm">No upcoming bookings.</p>;
  }

  return (
    <div className="space-y-2">
      {bookings.map((booking) => (
        <BookingRow
          key={booking.id}
          booking={booking}
          cancelPending={cancelPending}
          onCancel={onCancel}
          onReschedule={onReschedule}
        />
      ))}
    </div>
  );
}
