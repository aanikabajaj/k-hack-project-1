# Member/Booking side — complete refactor & fix log (final)

**Owner:** Aanika Bajaj — member-facing pages (dashboard, schedule, plans, waitlist,
notifications, register, login) and the `bookings`/`reschedules`/`booking-rules` routers.

This is the complete, up-to-date account of everything done on the member/booking side
across both work sessions: the structural refactor, every bug fixed, and the two
atomicity/cache fixes added afterward. It supersedes nothing — the detailed working log is
still [`member-booking-notes.md`](member-booking-notes.md), the first fix-focused writeup is
[`member-booking-refactor-and-fixes.md`](member-booking-refactor-and-fixes.md), and the
follow-up session is [`fixes-2026-08-15.md`](fixes-2026-08-15.md) — this document exists so
there's one place that has the whole picture without reading all three.

Every claim below was checked directly against `github.com/Rahul-Callus/flexfit-studio`, not
assumed. No schema changes, no renamed or removed procedures, no changed authorization rules,
throughout all of it.

## 1. How the code was restructured

**`server/routers/bookings.ts` (405 lines, the single biggest file in the original repo)
became a folder.** `bookings/member.ts` holds the self-service procedures (`mine`, `book`,
`cancel`, `waitlisted`); `bookings/staff.ts` holds the front-desk/roster ones, gated on
`staffProcedure`; `bookings/index.ts` composes both back into the same flat `bookingsRouter`
shape. All 7 original procedure names are preserved exactly.

**New `server/routers/booking-rules.ts`** centralizes what both `bookings/` and
`reschedules.ts` need: `hoursUntil()`, `activeMembershipFor()`, `isClassFull()`,
`refundIfEligible()`, `promoteNextWaitlisted()`, and the shared policy constants — each of
which used to be defined 2–3 times over across the original's routers.

**`reschedules.ts`:** the original had two full, independent ~150-line copies of the same
eligibility chain — one in the `reschedule` mutation, one in `validateReschedule`. Both now
call one `checkReschedule()` function.

**The reschedule modal was rebuilt as a calendar.** The original rendered every
matching-name class as a flat scrollable list. It's now a month-grid: dates with an
available class are highlighted, picking one auto-selects the class or opens a time-picker
if more than one runs that day.

**`dashboard/page.tsx` (189 lines doing five jobs)** is now a 94-line orchestrator plus four
single-purpose components under `dashboard/_components/` (`MembershipCard`, `BookingsList`,
`BookingRow`, `RescheduleHistoryList`).

**New `src/components/ui/Banner.tsx`** (`ErrorBanner`/`SuccessBanner`) replaces six separate
hand-copies of `<p style={{ color: "#f87171" }}>` markup across dashboard, schedule,
waitlist, plans, login, and the reschedule modal, with colors from theme tokens instead of
hardcoded hex.

**New `src/lib/constants.ts`** (`UNLIMITED_CREDITS`, shared between client and server
without pulling DB code into the browser bundle) and **`src/lib/trpc-types.ts`**
(`RouterOutputs`, so component props are typed straight from the router).

Full rationale for this layout is in
[`member-booking-notes.md`](member-booking-notes.md#folder-layout-rationale-for-the-why-did-you-pick-this-question).

## 2. Bugs found and fixed (present in the original repo)

1. **No way to sign up.** `auth.register` was fully implemented server-side but unreachable
   — no `/register` route, no link to one. **Fixed:** added `src/app/register/page.tsx`,
   linked from `/login`.
2. **Rescheduling out of a full class stranded that class's waitlist.** The original
   `reschedule` cancelled the old booking with a raw `UPDATE` and never ran the promotion
   step `cancel` already had. **Fixed:** `reschedule` now calls the same
   `promoteNextWaitlisted` helper `cancel` uses.
3. **Waitlist promotion never notified anyone**, despite the schema having a
   `waitlist_promotion` notification type. **Fixed:** `promoteNextWaitlisted` now inserts one.
4. **Waitlisted bookings could be rescheduled on the backend but not from the UI.** The
   dashboard only showed Reschedule for `status === "booked"`; `/waitlist` had no reschedule
   option at all. **Fixed:** both pages now offer it for waitlisted bookings too.
5. **The reschedule modal let you pick your current class as the reschedule target**,
   guaranteeing a backend rejection. **Fixed:** the modal now excludes `fromClassId` from
   the candidate list.
6. **Dead code:** `reschedule` fetched the original booking's membership row and never used
   it. Removed, along with the now-unused import.
7. **`.btn-sm` was used across the app but defined nowhere**, so buttons using it silently
   rendered at default size. **Fixed:** added the class to `globals.css`.
8. **Joining a waitlist could be blocked by a credit check that ran before the code knew the
   class was full.** Waitlisting has never charged credits, so a member with too few credits
   for a paid seat could be blocked from a free waitlist spot. **Fixed:** the credit check
   now only applies when `!isFull`.

Full write-up with quoted original source for each:
[`member-booking-refactor-and-fixes.md`](member-booking-refactor-and-fixes.md#part-2--bugs-found-and-fixed).

## 3. One render-performance fix

The reschedule modal built its class-list query with `{ from: new Date().toISOString() }`
directly in the render body — a fresh timestamp on every render changed React Query's cache
key every render, so the class list could never actually be served from cache. **Fixed:**
the timestamp is now held in `useState`, computed once and only refreshed when the modal
opens.

## 4. Two fixes added in the follow-up pass (August 15)

Found while auditing this side end-to-end a second time; both verified against a running
`pnpm dev` in the combined project (see
[`fixes-2026-08-15.md`](fixes-2026-08-15.md) for the full verification log):

- **`/waitlist` could show a stale list after joining one from `/schedule`.** Booking a full
  class invalidated `bookings.mine` and `classes.list` but not `bookings.waitlisted`, the
  query `/waitlist` actually reads. **Fixed:** added the missing invalidation.
- **`book`, `cancel`, and `reschedule` weren't atomic.** Each was a sequence of separate
  reads and writes, not one transaction — a capacity/credit check and the write it gated
  could be split by a concurrent request (two members racing for a class's last spot could
  both read "not full" and both land as `"booked"`). **Fixed:** all three now run inside
  `ctx.db.transaction(async (tx) => ...)`, using a new `DbOrTx` type so the existing
  `booking-rules.ts` helpers work unchanged whether called with `db` or `tx`.

Not included here: the same pass also fixed `plans.subscribe` silently creating a second
active membership instead of topping up the existing one. That fix lives only in
`flexfit-studio-combined-final/src/server/routers/plans.ts` — `plans.ts` was never copied
into this folder's file set, even though the ownership table in
[`member-booking-notes.md`](member-booking-notes.md) lists it as member-owned.

## What's still deliberately left alone

Nothing behavioral remains open on this side — `plans.subscribe`'s double-membership issue
(the last thing flagged as left-as-is) was resolved in the follow-up pass, §4 above. What's
still intentionally untouched is architectural boundary, not a bug:

- Shared infrastructure (`db/schema.ts`, `db/seed.ts`, `db/index.ts`, `server/trpc.ts`,
  `server/routers/_app.ts`, the tRPC route handler, root layout/providers) and staff/admin
  owned files (`NavBar.tsx`, `payments.ts`, the admin/corporate/trainer routers/services)
  were not changed unilaterally.

## Net effect, all sessions combined

No schema changes. No renamed or removed procedures. No changed authorization rules.

- 6 pieces of logic that used to be implemented 2–3 times each now exist once.
- 8 confirmed correctness bugs fixed, each verified against the original repository.
- 1 render-performance bug fixed (query-key thrashing in the reschedule modal).
- 2 atomicity/cache-consistency fixes added in the follow-up pass (transactions on
  `book`/`cancel`/`reschedule`; the `/waitlist` cache-invalidation gap).
- 1 related fix (membership top-up) applied and verified in the combined project, out of
  this folder's scope since it touches a router not carried here.
