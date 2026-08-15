"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";
import { ErrorBanner, SuccessBanner } from "@/components/ui/Banner";

export default function SchedulePage() {
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  // Computed once on mount rather than inline on every render - a fresh
  // `new Date().toISOString()` on each render changes the query input, so
  // react-query treats it as a brand new query every time and the page
  // never leaves its loading state.
  const [fromISO] = useState(() => new Date().toISOString());
  const { data: classes, isLoading } = trpc.classes.list.useQuery({
    from: fromISO,
  });
  const { data: myBookings } = trpc.bookings.mine.useQuery(
    { includePast: false },
    { enabled: !!user },
  );

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // classId -> the member's own active booking status for it, so a class
  // they've already booked or waitlisted shows that instead of a "Book"
  // button they can click again into a "you're already on the list" error.
  //
  // Guarded on `user`, not just on `myBookings` being present: disabling a
  // query (see `enabled: !!user` above) stops it from *fetching*, but
  // react-query keeps serving its last cached result regardless. Without
  // this check, a tab that was signed in earlier and then signed out would
  // keep showing that previous account's booked/waitlisted classes to
  // whoever's looking at the page now.
  const myStatusByClassId = useMemo(() => {
    const map = new Map<number, "booked" | "waitlisted">();
    if (!user) return map;
    for (const b of myBookings ?? []) {
      if (b.status === "booked" || b.status === "waitlisted") {
        map.set(b.classId, b.status);
      }
    }
    return map;
  }, [myBookings, user]);

  const book = trpc.bookings.book.useMutation({
    onSuccess: async (result, variables) => {
      await utils.classes.list.invalidate();
      await utils.bookings.mine.invalidate();
      // A booking landing as "waitlisted" needs the /waitlist page's own
      // query invalidated too - bookings.mine alone doesn't cover it, and
      // without this the waitlist page can serve a stale list (missing the
      // entry just joined) for up to the query's 5s staleTime.
      await utils.bookings.waitlisted.invalidate();
      const className = classes?.find((c) => c.id === variables.classId)?.name ?? "the class";
      setSuccessMessage(
        result.status === "waitlisted"
          ? `You're on the waitlist for ${className}.`
          : `You're booked into ${className}.`,
      );
      setTimeout(() => setSuccessMessage(null), 4000);
    },
  });

  if (isLoading) return <p className="muted">Loading schedule...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Class schedule</h1>
        <p className="muted mt-1 text-sm">
          {classes?.length ?? 0} upcoming classes
        </p>
      </div>

      {successMessage && <SuccessBanner message={successMessage} />}
      {book.error && <ErrorBanner message={book.error.message} />}

      <div className="space-y-2">
        {classes?.map((c) => {
          const myStatus = myStatusByClassId.get(c.id);
          const isBookingThis = book.isPending && book.variables?.classId === c.id;

          return (
            <div
              key={c.id}
              className="panel flex items-center gap-4 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium">{c.name}</h2>
                  {c.full && (
                    <span
                      className="rounded px-1.5 py-0.5 text-xs"
                      style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                    >
                      Full
                    </span>
                  )}
                </div>
                <p className="muted mt-0.5 text-sm">
                  {formatDateTime(c.startsAt)} &middot; {c.room} &middot;{" "}
                  {c.trainerName ?? "Unassigned"} &middot; {c.durationMin} min
                </p>
              </div>

              <div className="text-right text-sm muted">
                <div>
                  {c.spotsLeft} / {c.capacity} left
                </div>
                <div>
                  {c.creditCost} credit{c.creditCost === 1 ? "" : "s"}
                </div>
              </div>

              {myStatus ? (
                <span
                  className="rounded px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide"
                  style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                >
                  {myStatus === "waitlisted" ? "Waitlisted" : "Booked"}
                </span>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={!user || isBookingThis}
                  onClick={() => book.mutate({ classId: c.id })}
                >
                  {isBookingThis ? "Booking..." : c.full ? "Join waitlist" : "Book"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!user && (
        <p className="muted text-sm">Sign in to book a class.</p>
      )}
    </div>
  );
}
