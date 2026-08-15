# Member & Booking side — working notes

Owner: me (member-facing pages + auth/bookings/classes/plans/reschedules/notifications/members routers).
Teammate owns: staff/admin/trainer/kiosk pages + admin/admin-companies/corporate-bookings/trainers/payments routers.

This file is my running log for the refactor: what's shared and must not be
touched unilaterally, what was actually broken, and what I changed and why.
Update it as the work continues instead of relying on chat history.

## Files shared with my teammate — don't change without telling them

These are imported by, or affect, both sides. If either of us needs to
change one, sync first.

| File | Why it's shared |
| --- | --- |
| `src/db/schema.ts` | Table definitions both sides query. |
| `src/db/seed.ts` | Seed data both sides depend on for local testing. |
| `src/db/index.ts` | The DB client singleton. |
| `src/server/trpc.ts` | `protectedProcedure`/`staffProcedure`/`adminProcedure`, session context - every router on both sides is built on this. |
| `src/server/routers/_app.ts` | Registers every router (mine and theirs) into one `appRouter`. |
| `src/app/api/trpc/[trpc]/route.ts` | The tRPC HTTP handler. Basically never needs touching. |
| `src/components/NavBar.tsx` | Renders links for every role. I flag member-facing nav changes; they own admin/staff links. |
| `src/app/layout.tsx`, `src/app/providers.tsx` | Root layout and the tRPC/React Query provider setup. |
| `src/app/globals.css` | Shared design tokens/utility classes. I added `--danger`, `--warning`, `--warning-bg`, and `.btn-sm` - all additive, nothing renamed or removed, so it shouldn't affect their pages. Worth a heads-up anyway. |
| `tailwind.config.ts`, `tsconfig.json`, `next.config.mjs`, `package.json` | Project-wide config. |

Also worth flagging even though it's not a shared *file*: [plans/page.tsx](../src/app/plans/page.tsx)
(mine) calls `trpc.payments.mine`, which is defined in `payments.ts` (theirs).
If they change that query's output shape, my page breaks silently.

## What was actually broken (found by reading the code, not by running it -
I don't have Node available in this environment to run the dev server or
`tsc`; please run `npx tsc --noEmit` and click through the flows below after
pulling these changes)

1. **No way to sign up.** `auth.register` was fully implemented and working
   server-side, but no page ever called it - there was no `/register` route
   and no link to one anywhere. New members could not create an account
   through the app; only the three seeded accounts could sign in.
   **Fixed:** added `src/app/register/page.tsx`, linked from `/login`. Wires
   up the existing endpoint; didn't change its behavior.

2. **Rescheduling out of a full class stranded that class's waitlist.**
   `bookings.cancel` promotes the longest-waiting person on a class's
   waitlist when a confirmed spot frees up. `reschedules.reschedule` froze
   a confirmed spot the same way (moving to a different class time) but
   cancelled the original booking with a raw `UPDATE`, never running the
   promotion step. Anyone who rescheduled out of a booked class left their
   old spot vacant instead of it going to the next person waiting.
   **Fixed:** `reschedule` now calls the same `promoteNextWaitlisted` helper
   `cancel` uses, only when the original booking was "booked" (not
   "waitlisted" - matches `cancel`'s existing rule). No refund is triggered
   by this path, since a reschedule's credits carry over to the new booking
   rather than being returned.

3. **Waitlist promotion never notified anyone.** The schema has a
   `waitlist_promotion` notification type (seed data even includes a sample
   of one), but nothing ever inserted one - a member promoted off a waitlist
   found out only by noticing their booking status changed. **Fixed:**
   `promoteNextWaitlisted` now inserts a notification when it promotes
   someone.

4. **Waitlisted bookings could be rescheduled on the backend but not from
   the UI.** `reschedules.reschedule`'s own validation explicitly allows
   rescheduling a "waitlisted" booking, not just a "booked" one - but the
   dashboard only showed the Reschedule button for `status === "booked"`,
   and the `/waitlist` page had no reschedule option at all (cancel only).
   **Fixed:** both pages now offer Reschedule for waitlisted bookings too.

5. **The reschedule modal let you pick your current class as the
   "reschedule to" target**, which the backend would then reject with
   "You are already booked for this class." Avoidable dead-end.
   **Fixed:** modal now takes a `fromClassId` prop and excludes it from the
   candidate list.

6. **Dead code:** `reschedules.ts`'s `reschedule` mutation fetched the
   original booking's membership row ("to check for unlimited credits") and
   never used the result. Removed along with the now-unused `memberships`
   import in that file.

## Things I noticed but deliberately did NOT change (behavior, not bugs -
flagging per the "fix carefully or document it" instruction)

- **`plans.subscribe` doesn't check for an existing active membership.** A
  member can buy a second plan while the first is still active. Both rows
  stay `status: "active"`; every place that looks up "the" active
  membership (`activeMembershipFor` in `booking-rules.ts`, and
  `members.profile`) picks whichever has the later `endDate`, so the older
  membership's remaining credits become silently unreachable. Whether a
  second purchase should be blocked, or should top up/extend the existing
  membership instead, is a product decision, not something to guess at
  silently since it touches money and credits. Left as-is.
- **`.btn-sm` was used in `notifications/page.tsx` but never defined**, so
  the "Mark all as read" button silently rendered at normal button size.
  Added the class to `globals.css` (additive, see the shared-files table
  above) rather than removing the reference, since the smaller size was
  clearly the intent.

## What changed, structurally

- `server/routers/bookings.ts` (405 lines, the single biggest file in the
  repo) is now `server/routers/bookings/` - `member.ts` (self-service:
  `mine`, `book`, `cancel`, `waitlisted`) and `staff.ts` (front-desk/roster
  ops, all `staffProcedure`-gated: `markAttended`, `rosterFor`,
  `upcomingForMember`, `checkinCountFor`), composed back into the same flat
  `bookingsRouter` shape in `index.ts`. `_app.ts` needed no changes - `from
  "./bookings"` still resolves to the folder.
- New `server/routers/booking-rules.ts` holds what both `bookings/` and
  `reschedules.ts` need: `hoursUntil`, `activeMembershipFor`, `isClassFull`,
  `refundIfEligible`, `promoteNextWaitlisted`, and the three policy
  constants. This is what used to be two duplicate copies of
  `hoursUntil`/`activeMembershipFor`, three duplicate copies of the
  "is this class full" count, and duplicated refund/promotion logic.
- `reschedules.ts`: the ~120-line validation chain that `reschedule` and
  `validateReschedule` each carried a full copy of is now one
  `checkReschedule` function returning a typed ok/fail result: `reschedule`
  throws the matching `TRPCError`, `validateReschedule` returns
  `{valid, reason}` - same as before, just not duplicated.
- New `src/lib/constants.ts` holds `UNLIMITED_CREDITS` (999) so client
  components (`MembershipCard`, the plans page) can use the same constant
  the server does without importing server-only DB code into the browser
  bundle. `booking-rules.ts` re-exports it for existing server-side callers.
- New `src/lib/trpc-types.ts` exports `RouterOutputs` (via tRPC's
  `inferRouterOutputs`) so component props can be typed straight from the
  router instead of hand-copied shapes that can drift.
- `dashboard/page.tsx` (173 lines doing five jobs) is split into
  `dashboard/_components/`: `MembershipCard`, `BookingsList` + `BookingRow`,
  `RescheduleHistoryList`. The page itself is now just data-fetching +
  composition. Used the Next.js `_folder` convention (excluded from
  routing) since these are page-specific, not shared app-wide.
- New `src/components/ui/Banner.tsx` (`ErrorBanner`/`SuccessBanner`)
  replaces the identical inline-styled `<p style={{color: "#f87171"}}>`
  markup that was hand-copied into dashboard, schedule, waitlist, plans,
  login, and the reschedule modal. Colors now come from CSS variables
  (`--danger`, `--accent`) instead of hardcoded hex.

## Folder layout rationale (for the "why did you pick this" question)

- `server/routers/<domain>/` (member/staff split) for routers whose
  procedures split cleanly along a real permission boundary
  (`protectedProcedure` vs `staffProcedure`). Reschedules didn't get this
  treatment because it doesn't have that split - it's all member-facing.
- `server/routers/booking-rules.ts` sits one level up from `bookings/` so
  it's importable by sibling top-level routers (`reschedules.ts`) without
  reaching across into another router's subfolder.
- `app/<page>/_components/` for components used by exactly one page
  (Next.js excludes `_`-prefixed folders from routing). `src/components/`
  stays for things genuinely shared across pages (`NavBar`, the
  `RescheduleModal` used by both dashboard and waitlist, the new `Banner`).
- `src/lib/` stays framework-agnostic and import-safe from both client and
  server code; anything that touches the DB belongs under `server/` instead.
