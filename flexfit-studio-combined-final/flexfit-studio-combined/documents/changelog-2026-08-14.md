# Changelog — August 14, 2026

This documents everything that changed in the FlexFit Studio codebase
yesterday. Both changes below were applied in this project
(`flexfit-studio-combined-final`) — the pre-merge projects
(`flexfit-studio-staff-refactored`, `member-booking-refactor`) were only the
sources diffed against to reconstruct this record, not where the changes
happened. There's no git history in this project to generate this from, so
it's reconstructed from file timestamps and by diffing the current source
against those two pre-merge projects. Two things happened, a few hours
apart:

1. **The combined merge** (~19:49) — two parallel refactors were merged into
   this single project.
2. **A post-merge bug-fixing pass** (~21:43–22:57) — five real bugs found
   and fixed in the merged code, confirmed by diffing against the pre-merge
   sources.

---

## 1. The combined merge

Two independently refactored versions of the app were combined into one
project:

- **Member / Booking** refactor (dashboard, schedule, plans, waitlist,
  notifications, rescheduling, `bookings` router)
- **Staff / Admin / Corporate** refactor (admin dashboard, reports,
  attendance, announcements, companies, corporate bookings, trainers,
  kiosk, payments)

Key points (see [combined-refactoring.md](combined-refactoring.md) for the
full report):

- The old single `server/routers/bookings.ts` was split into
  `server/routers/bookings/{index,member,staff}.ts`, composed back into the
  same public `bookings` router so no client call sites changed.
- Shared booking rules (membership lookup, cancellation/refund, capacity,
  waitlist promotion, time math) were centralized into
  `server/routers/booking-rules.ts`, replacing several duplicated copies.
- Staff-side business logic was extracted out of the tRPC routers into
  `server/services/{admin-report-service, company-service,
  corporate-booking-service, trainer-service}.ts`, with the routers left as
  a thin API boundary.
- No schema changes, no renamed/removed public tRPC procedures, no changed
  authorization rules. Payments/refund logic was left untouched by design.
- Also fixed as part of this merge (see
  [member-booking-notes.md](member-booking-notes.md) for details): missing
  `/register` page, rescheduling out of a full class not promoting the
  waitlist, waitlist promotion never sending a notification, waitlisted
  bookings not offering a Reschedule button in the UI, the reschedule modal
  allowing you to pick your own current class, and an undefined `.btn-sm`
  CSS class.

## 2. Post-merge bug-fixing pass

After the merge, five more bugs were found and fixed in the merged code.
Confirmed by diffing against the pre-merge source projects — these are not
present in either original refactor; they were introduced by the merge or
found during a fix pass afterward.

### 2.1 Reschedule modal redesigned to a calendar date-picker

**Files:** [`src/lib/format.ts`](../src/lib/format.ts),
[`src/components/reschedule-modal.tsx`](../src/components/reschedule-modal.tsx)

The modal previously showed every matching-name class as a flat scrollable
list, hard to scan once there were more than a few dates. It's now a
month-grid calendar: dates with an available class are highlighted, picking
a date auto-selects the class if there's only one that day or shows a
time-picker if there's more than one. Added `formatTime()` to `format.ts` to
support the new time-picker list, and guarded the "from" timestamp so it's
captured once when the modal opens rather than recomputed every render
(which was starving the class-list query of a stable input).

### 2.2 Admin/trainer accounts were shown member navigation links

**File:** [`src/components/NavBar.tsx`](../src/components/NavBar.tsx)

The "Schedule" link rendered for every signed-in *and* signed-out visitor,
and the "My bookings"/"Waitlist" links rendered for any signed-in user,
including admins. **Fixed:** all three member-facing nav links are now
gated on `user && user.role !== "admin"`, matching how the rest of the nav
already treats role.

### 2.3 Schedule page: duplicate-booking dead-ends and a stale-session cache bug

**File:** [`src/app/schedule/page.tsx`](../src/app/schedule/page.tsx)

Two related fixes:

- Classes you'd already booked or waitlisted still showed a clickable
  "Book"/"Join waitlist" button, which the backend would then reject with
  "You are already on the list for this class." The page now looks up your
  own booking status per class and shows a Booked/Waitlisted badge instead
  of a button for those classes, plus a success toast on booking.
- The per-class "your status" lookup is disabled (not fetched) while
  signed out, but React Query keeps serving its last cached result
  regardless of the `enabled` flag — so a browser tab that had been signed
  in and then signed out could keep showing the previous account's
  booked/waitlisted classes to whoever was looking at the page next. Fixed
  by explicitly returning an empty map when there's no signed-in user
  instead of relying on the query being disabled.

### 2.4 Rescheduling into/out of a full class mismanaged credits

**File:** [`src/server/routers/reschedules.ts`](../src/server/routers/reschedules.ts)

`reschedule` always copied the old booking's `creditsUsed` onto the new
booking unchanged. That's only correct when a confirmed spot moves to
another confirmed spot. It broke down on a status flip:

- **Booked → waitlisted** (rescheduling into a full class): the new
  waitlisted booking kept `creditsUsed` copied from the old confirmed
  booking instead of being reset to 0, and then got charged *again* if it
  was later promoted off the waitlist — a double charge.
- **Waitlisted → booked** (rescheduling into an open class): the new
  confirmed booking inherited `creditsUsed: 0` from the old waitlisted
  booking, so the member held a confirmed seat without ever having paid
  for it.

**Fixed:** the new booking's credits are now computed from the status it's
actually landing in — refunded back to the membership when dropping to
waitlisted, charged (with a credit-sufficiency check) when moving up to
booked. A straight booked→booked reschedule is unaffected and still just
carries the credits over.

### 2.5 Joining a waitlist incorrectly required spare class credits

**File:** [`src/server/routers/bookings/member.ts`](../src/server/routers/bookings/member.ts)

`bookings.book` checked `membership.creditsRemaining < cls.creditCost` and
rejected the booking before checking whether the class was even full. Since
joining a waitlist never charges credits, this meant a member with 0 credits
remaining (or fewer than the class costs) couldn't join a waitlist for a
full class, even though doing so wouldn't have cost them anything.
**Fixed:** the credit check now only applies when the class isn't full
(`!isFull && !unlimited && ...`), matching how waitlisted bookings are
actually charged (`creditsUsed: 0`).

---

## Not changed

- `src/app/login/page.tsx` was touched during this pass but is byte-identical
  to the pre-merge member-side version — no functional change ended up
  being needed there.
- Database schema, public tRPC procedure names/inputs, authorization rules,
  and payment/refund logic were left untouched throughout both the merge
  and this fix pass, consistent with the constraints recorded in
  [staff-known-issues.md](staff-known-issues.md) and
  [staff-architecture.md](staff-architecture.md).
