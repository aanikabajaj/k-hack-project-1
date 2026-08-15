# FlexFit Studio

A gym management app — members book classes, buy memberships, spend class credits and sit on
waitlists; staff run a front desk, manage trainers and pull revenue reports; companies buy
credit pools for their employees to use.

Stack: Next.js 15 (App Router), TypeScript, tRPC, Drizzle ORM, SQLite, Tailwind.

This was a refactoring exercise on an existing app that had "been through five developers in
two years, none of whom spoke to each other." The brief was to restructure and rewrite it to
sensible, modern Next.js/TypeScript practice — breaking up files that had grown too big and
pulling repeated logic into one place — **without changing any existing behavior**: same
inputs, same outputs, same errors, same edge cases, for every feature that already worked.

## Team

Built by a team of 2:

- **Aanika Bajaj** — member-facing side: dashboard, schedule, plans, waitlist, notifications,
  rescheduling, and the `bookings`/`reschedules`/`booking-rules` routers.
- **Aksh Vats** — staff/admin side: admin dashboard, reports, attendance, announcements,
  companies, corporate bookings, trainers, kiosk, and payments.

The two refactors were built independently against the same starting codebase and then merged.
Each person's individual contribution is also preserved on its own (see
[`member-booking-refactor/`](member-booking-refactor/) below) per the assignment's requirement
that each teammate submit their own part of the work individually.

## Repository layout

```
flexfit-studio-combined-final/
  flexfit-studio-combined/       the merged, runnable app — both sides combined
member-booking-refactor/         Aanika's individual submission (member/booking side only)
```

(`flexfit-studio-combined-final` has one extra level of nesting — the actual project lives in
its `flexfit-studio-combined/` subfolder.)

A third folder used during development, `flexfit-studio-staff-refactored` (Aksh's individual
submission, staff/admin side only), is **not** included in this repo.

## Running the combined project

`flexfit-studio-combined-final/flexfit-studio-combined/` is the full app and the only one of
the two folders here that runs standalone.

Requirements: Node 20+ and pnpm (`npm install -g pnpm` if you don't have it). The database is
SQLite and lives in a file — nothing else to install, no account to create.

```bash
cd flexfit-studio-combined-final/flexfit-studio-combined
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

That gets you a populated studio at http://localhost:3000, with a couple of weeks of classes
either side of today.

| Command         | What it does                                       |
| --------------- | --------------------------------------------------- |
| `pnpm dev`      | Development server on port 3000                     |
| `pnpm build`    | Production build                                     |
| `pnpm db:push`  | Apply the schema in `src/db/schema.ts`               |
| `pnpm db:seed`  | Wipe the data and reseed                             |
| `pnpm db:reset` | Delete the database file, then push and seed again   |

**Sign in with:**

| Role    | Email                | Password   |
| ------- | --------------------- | ---------- |
| Admin   | admin@flexfit.test    | admin123   |
| Trainer | arjun@flexfit.test    | trainer123 |
| Member  | rahul.k@example.com   | member123  |

Every seeded member uses `member123`; other member emails are in `src/db/seed.ts`.

Don't run `pnpm build` while `pnpm dev` is running — the build writes over the directory the
dev server is using. Stop the dev server, delete `.next`, and start it again if that happens.

## About `member-booking-refactor/`

This folder is Aanika's individual submission — the member/booking side of the refactor, kept
as its own source tree so the work can be reviewed and graded independently of the merge. It
holds only the files that side owns (`src/app/{dashboard,schedule,plans,waitlist,
notifications,register,login}`, the `bookings`/`reschedules`/`booking-rules` routers, and the
shared UI/lib pieces it added).

It is **not** standalone-runnable on its own — it doesn't include the database layer
(`src/db/`), the tRPC context/root router (`server/trpc.ts`, `server/routers/_app.ts`), the
staff/admin routers, or the root layout/providers, since those are shared infrastructure that
lives in the combined project. To actually run this side of the app (or any of the flows
described below), use `flexfit-studio-combined-final/flexfit-studio-combined` — that's where
this code ended up after the merge.

See [`member-booking-refactor/documents/member-booking-notes.md`](member-booking-refactor/documents/member-booking-notes.md)
for the detailed working notes on what was found broken and fixed on this side, and the
reasoning behind the folder layout.

## What changed

Work happened in two phases, a few hours apart, reconstructed from file timestamps and by
diffing the merged source against both pre-merge projects (there's no git history from before
this repo to pull it from directly):

1. **The combined merge** — the two independently-built refactors above were merged into one
   project (`flexfit-studio-combined-final`). No schema changes, no renamed/removed public
   tRPC procedures, no changed authorization rules, and payments/refund logic left untouched
   by design. Also fixed in this pass: a missing `/register` page, rescheduling out of a full
   class not promoting the waitlist, waitlist promotion never sending a notification,
   waitlisted bookings missing a Reschedule option in the UI, and an undefined `.btn-sm` CSS
   class.
2. **A post-merge bug-fixing pass** — five more bugs, found only in the merged code and
   confirmed by diffing against both pre-merge sources (none existed in either refactor on its
   own):
   - The reschedule modal was rebuilt as a month-grid calendar picker instead of a flat
     scrollable list.
   - Admins and signed-out visitors were incorrectly shown member-only nav links
     ("Schedule", "My bookings", "Waitlist").
   - The schedule page let you click "Book"/"Join waitlist" on classes you were already
     booked or waitlisted for (a guaranteed backend rejection), and could keep showing a
     previous account's bookings after sign-out due to a stale React Query cache.
   - Rescheduling into or out of a full class mishandled credits — sometimes double-charging,
     sometimes giving a free confirmed seat.
   - Joining a waitlist could be blocked by a credit-sufficiency check that should never have
     applied to waitlisting in the first place, since it's never charged credits.

Full write-ups, including exact files touched and before/after behavior, are in each folder's
`documents/` directory — see
[`flexfit-studio-combined-final/flexfit-studio-combined/documents/changelog-2026-08-14.md`](flexfit-studio-combined-final/flexfit-studio-combined/documents/changelog-2026-08-14.md)
and
[`member-booking-refactor/documents/changelog-2026-08-14.md`](member-booking-refactor/documents/changelog-2026-08-14.md).
