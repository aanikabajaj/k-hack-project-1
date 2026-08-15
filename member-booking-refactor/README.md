# FlexFit Studio — member/booking side

This is Aanika Bajaj's individual submission for the FlexFit Studio refactor: the
member-facing side of the app — dashboard, schedule, plans, waitlist, notifications,
rescheduling, and the `bookings`/`reschedules`/`booking-rules` routers.

It's kept here as its own source tree so this half of the work can be reviewed independently
of the merge. See the top-level [`README.md`](../README.md) for the full team/project context,
and [`documents/member-booking-notes.md`](documents/member-booking-notes.md) for the detailed
working notes — what was found broken, what was fixed and why, and the reasoning behind the
folder layout.

## This folder does not run standalone

It only contains the files this side owns. It's missing the shared infrastructure every route
here actually depends on at runtime:

- `src/db/` — schema, DB client, seed data
- `src/server/trpc.ts` and `src/server/routers/_app.ts` — tRPC context and the root router
- `src/app/layout.tsx`, `src/app/providers.tsx` — root layout and the tRPC/React Query provider
- the staff/admin/corporate routers `login`, `plans`, etc. call alongside these
- `src/app/api/trpc/[trpc]/route.ts` — the tRPC HTTP handler

Those live in the combined project, since they're shared with the staff/admin side. The
`package.json`/`tsconfig.json`/etc. in this folder let you install dependencies and typecheck
in isolation, but the dev server won't come up cleanly here.

**To actually run this code**, use the merged project instead:

```bash
cd ../flexfit-studio-combined-final/flexfit-studio-combined
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

That's documented in full in the top-level [`README.md`](../README.md).

## Layout

```
src/
  app/          member-facing routes: dashboard, schedule, plans, waitlist,
                notifications, register, login
  components/   NavBar, RescheduleModal, Banner — shared across these pages
  lib/          format helpers, constants, tRPC output types
  server/
    routers/
      bookings/         split into index.ts (composes the public router),
                         member.ts (self-service), staff.ts (front-desk ops)
      booking-rules.ts  shared membership/refund/waitlist/time logic
      reschedules.ts    reschedule validation + mutation
documents/      working notes and changelog for this side of the refactor
```
