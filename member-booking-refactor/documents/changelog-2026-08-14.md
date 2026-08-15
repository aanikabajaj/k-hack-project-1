# FlexFit Studio Changelog — What changed on August 14

Two parallel refactors were merged into one codebase, then five real bugs surfaced in the
merged code were found and fixed. Both phases below were applied in the combined project
(`flexfit-studio-combined-final`), not in `flexfit-studio-staff-refactored` — that project
(along with this one, `member-booking-refactor`) was only a pre-merge source diffed against
to reconstruct this record. Reconstructed from file timestamps and by diffing the merged
source against both pre-merge projects — there's no git history here to pull this from
directly.

**Summary:** 2 phases of work · ~55 files combined in the merge · 7 files touched in the
fix pass · 5 confirmed bugs fixed.

## Phase 01 — The combined merge (~19:49)

The Member/Booking refactor and the Staff/Admin/Corporate refactor — built independently —
were combined into a single project. No schema changes, no renamed or removed public tRPC
procedures, no changed authorization rules. Payments/refund logic was deliberately left
untouched.

- The old single `server/routers/bookings.ts` was split into `bookings/{index,member,staff}.ts`,
  recomposed into the same public `bookings` router — no client call sites changed.
- Shared booking rules (membership lookup, cancellation/refund, capacity, waitlist promotion,
  time math) were centralized into `booking-rules.ts`, replacing several duplicated copies.
- Staff-side business logic moved out of the tRPC routers into dedicated `server/services/`
  files, with routers left as a thin API boundary.
- Also fixed in this pass: a missing `/register` page, rescheduling out of a full class not
  promoting the waitlist, waitlist promotion never sending a notification, waitlisted bookings
  missing a Reschedule option in the UI, and an undefined `.btn-sm` CSS class.

## Phase 02 — Post-merge bug-fixing pass (~21:43 – 22:57)

Five more bugs, found in the merged code and confirmed by diffing against both pre-merge
sources — none of these existed in either original refactor on its own.

### 1. Reschedule modal rebuilt as a calendar picker

**Files:** `lib/format.ts`, `components/reschedule-modal.tsx`

- **Before:** Every matching-name class rendered as a flat scrollable list — hard to scan
  once there were more than a few dates.
- **Fixed:** Rebuilt as a month-grid calendar. Dates with an available class are highlighted;
  picking one auto-selects the class, or opens a time-picker if there's more than one that
  day. Added `formatTime()` for the time-picker, and the "from" timestamp is now captured
  once on open instead of recomputed every render.

### 2. Admins and signed-out visitors saw member-only nav links

**Files:** `components/NavBar.tsx`

- **Before:** "Schedule" rendered for every visitor, signed in or not. "My bookings" and
  "Waitlist" rendered for any signed-in user, admins included.
- **Fixed:** All three now gated on `user && user.role !== "admin"`, matching how the rest of
  the nav already handles role.

### 3. Duplicate-booking dead-ends, and stale bookings after sign-out

**Files:** `app/schedule/page.tsx`

- **Before:** Classes you'd already booked or waitlisted still showed a clickable button,
  which the backend then rejected with "You are already on the list for this class."
  Separately, the per-class status lookup is disabled while signed out, but React Query keeps
  serving its last cached result regardless — so a tab that had been signed in and then signed
  out could keep showing the previous account's bookings.
- **Fixed:** The page now shows a Booked/Waitlisted badge in place of the button for classes
  you already have a status on, plus a success toast on booking — and explicitly returns an
  empty status map when no one's signed in, instead of trusting the disabled query.

### 4. Rescheduling into or out of a full class mishandled credits

**Files:** `server/routers/reschedules.ts`

- **Before:** The new booking always copied the old booking's `creditsUsed` unchanged.
  Rescheduling into a full class kept the old charge and then charged *again* once promoted
  off the waitlist — a double charge. Rescheduling out of a full class into an open one
  inherited a $0 charge on a now-confirmed seat — a free ride.
- **Fixed:** Credits are now computed from the status the new booking actually lands in:
  refunded on a drop to waitlisted, charged (with a sufficiency check) on a promotion to
  booked. A plain booked → booked reschedule is unaffected.

### 5. Joining a waitlist required credits it never actually charged

**Files:** `server/routers/bookings/member.ts`

- **Before:** The credit-sufficiency check ran before checking whether the class was full, so
  a member with too few credits couldn't join a waitlist — even though waitlisting has never
  charged credits.
- **Fixed:** The check now only applies when the class isn't full, matching how waitlisted
  bookings are actually charged (`creditsUsed: 0`).

## Not changed

- `app/login/page.tsx` was touched during this pass but is byte-identical to the pre-merge
  version — no functional change ended up being needed there.
- Database schema, public tRPC procedure names and inputs, authorization rules, and
  payment/refund logic were left untouched throughout both the merge and this fix pass.

---
*Source: [FlexFit Studio Changelog artifact](https://claude.ai/code/artifact/8a599593-905e-4f64-ac51-92444b796a0d), added to this documents folder on 2026-08-15.*
