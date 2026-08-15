"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ErrorBanner, SuccessBanner } from "@/components/ui/Banner";
import { RescheduleModal } from "@/components/reschedule-modal";
import { MembershipCard } from "./_components/MembershipCard";
import { BookingsList } from "./_components/BookingsList";
import { RescheduleHistoryList } from "./_components/RescheduleHistoryList";
import type { DashboardBooking } from "./_components/BookingRow";

interface RescheduleTarget {
  bookingId: number;
  classId: number;
  className: string;
  startsAt: string;
}

export default function DashboardPage() {
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.members.profile.useQuery(undefined, {
    retry: false,
  });
  const { data: bookings } = trpc.bookings.mine.useQuery({ includePast: false });
  const { data: rescheduleHistory } = trpc.reschedules.history.useQuery();

  const cancel = trpc.bookings.cancel.useMutation({
    onSuccess: async () => {
      await utils.bookings.mine.invalidate();
      await utils.bookings.waitlisted.invalidate();
      await utils.members.profile.invalidate();
      await utils.classes.list.invalidate();
    },
  });

  if (isLoading) return <p className="muted">Loading...</p>;
  if (!profile) return <p className="muted">Please sign in to view your bookings.</p>;

  function openRescheduleModal(booking: DashboardBooking) {
    setRescheduleTarget({
      bookingId: booking.id,
      classId: booking.classId,
      className: booking.className,
      startsAt: booking.startsAt,
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hello, {profile.name.split(" ")[0]}
        </h1>
        <p className="muted mt-1 text-sm">
          {profile.classesAttended} classes attended
        </p>
      </div>

      <MembershipCard membership={profile.membership} />

      <section className="space-y-3">
        <h2 className="font-medium">Upcoming bookings</h2>

        {successMessage && <SuccessBanner message={successMessage} />}
        {cancel.error && <ErrorBanner message={cancel.error.message} />}

        <BookingsList
          bookings={bookings}
          cancelPending={cancel.isPending}
          onCancel={(bookingId) => cancel.mutate({ bookingId })}
          onReschedule={openRescheduleModal}
        />
      </section>

      <RescheduleHistoryList history={rescheduleHistory} />

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
