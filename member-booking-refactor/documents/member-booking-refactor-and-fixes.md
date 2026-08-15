# Member/Booking side — how it was refactored, and what was fixed

**Owner:** Aanika Bajaj — member-facing pages (dashboard, schedule, plans, waitlist,
notifications, register, login) and the `bookings`/`reschedules`/`booking-rules` routers.

This is a standalone account of the member/booking side of the FlexFit Studio refactor:
what changed structurally, and what bugs were found and fixed along the way. It's written
to be readable on its own for the individual-submission requirement — for the running
day-to-day log this was worked from, see
[`member-booking-notes.md`](member-booking-notes.md); for a verified diff against the
original public repo covering the whole app, see the
[refactor audit](https://claude.ai/code/artifact/64725c89-fa30-46b5-ae4b-ce7b1a367362).

Every claim below was checked directly against `github.com/Rahul-Callus/flexfit-studio` —
not assumed from a summary.

## Part 1 — How the code was restructured

**`server/routers/bookings.ts` (405 lines, the single biggest file in the original repo)
became a folder.** `bookings/member.ts` holds the self-service procedures (`mine`, `book`,
`cancel`, `waitlisted`); `bookings/staff.ts` holds the front-desk/roster ones, all gated on
`staffProcedure` (`markAttended`, `rosterFor`, `upcomingForMember`, `checkinCountFor`);
`bookings/index.ts` composes both back into the same flat `bookingsRouter` shape the rest
of the app already imports. All 7 original procedure names are preserved exactly, so no
client call site changed.

**New `server/routers/booking-rules.ts`** centralizes what both `bookings/` and
`reschedules.ts` need:

- `hoursUntil()` — previously defined separately in `bookings.ts` and `reschedules.ts`.
- `activeMembershipFor()` — previously defined separately in the same two files.
- `isClassFull()` — previously an inline capacity count, recomputed separately in
  `bookings.ts` and twice in `reschedules.ts`.
- `refundIfEligible()` and `promoteNextWaitlisted()` — previously two separate, drifted
  implementations of "refund if eligible, then promote the longest-waiting person" (see
  Part 2, bug 2 — the drift here was an actual bug, not just repetition).
- The three shared policy constants (`FREE_CANCELLATION_HOURS`, `FREE_RESCHEDULE_HOURS`,
  `UNLIMITED_CREDITS`).

**`reschedules.ts`:** the original had two full, independent copies of the same
~150-line eligibility chain — one inside the `reschedule` mutation, one inside the
`validateReschedule` query. Both now call one `checkReschedule()` function; the mutation
throws the matching `TRPCError` on failure, the query returns `{ valid, reason }`.

**The reschedule modal was rebuilt as a calendar.** The original rendered every
matching-name class as a flat scrollable list — unusable once there were more than a few
dates. It's now a month-grid: dates with an available class are highlighted, picking one
auto-selects the class or opens a time-picker if more than one runs that day. This also
fixed a real perf bug — see Part 3.

**`dashboard/page.tsx` (189 lines doing five jobs)** — fetching data, rendering the
membership card, the bookings list, each booking row, and reschedule history — is now a
94-line orchestrator plus four single-purpose components under `dashboard/_components/`
(`MembershipCard`, `BookingsList`, `BookingRow`, `RescheduleHistoryList`), using Next's
`_folder` convention since they're page-specific, not shared app-wide.

**New `src/components/ui/Banner.tsx`** (`ErrorBanner`/`SuccessBanner`) replaces
`<p style={{ color: "#f87171" }}>` (and `"#4ade80"` for success), which had been
hand-copied into dashboard, schedule, waitlist, plans, login, and the reschedule modal —
six separate copies of the same markup. Colors now come from `--danger`/`--accent` theme
tokens instead of a hardcoded hex.

**New `src/lib/constants.ts`** holds `UNLIMITED_CREDITS` so client components
(`MembershipCard`, the plans page) can use the same constant the server does without
pulling server-only DB code into the browser bundle; `booking-rules.ts` re-exports it for
server-side callers. **New `src/lib/trpc-types.ts`** exports `RouterOutputs` so component
props are typed straight from the router instead of hand-copied shapes that can drift out
of sync.

## Part 2 — Bugs found and fixed

Found by reading the original source, each confirmed against the actual code rather than
inferred:

1. **No way to sign up.** `auth.register` was fully implemented and working server-side,
   but no page ever called it — there was no `/register` route and no link to one anywhere.
   Only the three seeded accounts could sign in. **Fixed:** added
   [`src/app/register/page.tsx`](../src/app/register/page.tsx), linked from `/login`,
   wiring up the existing endpoint without changing its behavior.

2. **Rescheduling out of a full class stranded that class's waitlist.**
   `bookings.cancel` promotes the longest-waiting person on a waitlist when a confirmed
   spot frees up; `reschedules.reschedule` freed a confirmed spot the same way but
   cancelled the original booking with a raw `UPDATE`, never running the promotion step.
   **Fixed:** `reschedule` now calls the same `promoteNextWaitlisted` helper `cancel` uses,
   only when the original booking was `"booked"` — matching `cancel`'s existing rule. No
   refund is triggered on this path, since a reschedule's credits carry over to the new
   booking instead of being returned.

3. **Waitlist promotion never notified anyone.** The schema defines a
   `waitlist_promotion` notification type (seed data even ships a sample row of one), but
   nothing ever inserted one. **Fixed:** `promoteNextWaitlisted` now inserts a notification
   when it promotes someone.

4. **Waitlisted bookings could be rescheduled on the backend but not from the UI.**
   `reschedules.reschedule`'s own validation explicitly allows rescheduling a
   `"waitlisted"` booking, not just a `"booked"` one — but the dashboard only showed the
   Reschedule button for `status === "booked"`, and `/waitlist` had no reschedule option at
   all (cancel only). **Fixed:** both pages now offer Reschedule for waitlisted bookings
   too.

5. **The reschedule modal let you pick your current class as the reschedule target**,
   which the backend then rejected with "You are already booked for this class." **Fixed:**
   the modal now takes a `fromClassId` prop and excludes it from the candidate list.

6. **Dead code.** `reschedules.ts`'s `reschedule` mutation fetched the original booking's
   membership row ("to check for unlimited credits") and never used the result. Removed,
   along with the now-unused `memberships` import in that file.

7. **`.btn-sm` was used across the app — notifications, kiosk, trainer schedule, several
   admin pages — but defined nowhere**, so every button that expected the smaller size
   silently rendered at the default one. **Fixed:** added `.btn-sm` to `globals.css`
   (additive — nothing renamed or removed on the staff side that also uses it).

8. **Joining a waitlist could be blocked by a credit check that ran before the code even
   knew the class was full.** In the original `bookings.book`,
   `membership.creditsRemaining < cls.creditCost` was checked unconditionally, before
   `isFull` was computed. Joining a waitlist has never charged credits
   (`creditsUsed: 0`), so a member with too few credits for a paid seat could be blocked
   from a free waitlist spot that was never going to cost them anything. **Fixed:** the
   credit check now only applies when `!isFull` — checked in `bookings/member.ts` against
   `isClassFull()` before the credit comparison runs.

## Part 3 — One fix that wasn't a logic bug

The reschedule modal built its class-list query like this, directly in the render body:

```ts
const { data: availableClasses } = trpc.classes.list.useQuery(
  { from: new Date().toISOString() },   // new value, every render
  { enabled: isOpen }
);
```

React Query keys a query by its serialized input, so a fresh timestamp on every render
means the cache key changes on every render — the class list could never actually be
served from cache. Every re-render the modal went through while open looked like a
brand-new query to fetch. **Fixed:** the timestamp is now held in state, computed once and
only refreshed when the modal opens:

```ts
const [fromISO, setFromISO] = useState(() => new Date().toISOString());
useEffect(() => {
  if (isOpen) setFromISO(new Date().toISOString());
}, [isOpen]);
```

## What was deliberately left alone

- **`plans.subscribe` doesn't check for an existing active membership** — a member can buy
  a second plan while the first is still active, and the older membership's remaining
  credits become silently unreachable (`activeMembershipFor` and `members.profile` both
  pick whichever membership has the later `endDate`). Whether a second purchase should be
  blocked, or should top up/extend the existing one, is a product decision that touches
  money — flagged rather than guessed at.
- Shared infrastructure (`db/schema.ts`, `db/seed.ts`, `db/index.ts`, `server/trpc.ts`,
  `server/routers/_app.ts`, the tRPC route handler, root layout/providers) and the
  staff/admin owned files (`NavBar.tsx`, `payments.ts`, the admin/corporate/trainer
  routers) were not changed unilaterally — see the shared-files table in
  [`member-booking-notes.md`](member-booking-notes.md).

## Net effect

No schema changes, no renamed or removed procedures, no changed authorization rules. 6
functions/logic blocks that used to be implemented 2–3 times each now exist once. 8
confirmed correctness bugs and 1 render-performance bug fixed, all verified against the
original repository rather than assumed.
