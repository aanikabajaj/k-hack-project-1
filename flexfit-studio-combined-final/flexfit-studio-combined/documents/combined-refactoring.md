# FlexFit Studio — Combined Refactoring Report

## Merge status

The Staff/Admin/Corporate refactor and the Member/Booking refactor have been combined into one project.

### Combined ownership

- Member & Booking: teammate's refactor
- Staff, Admin & Corporate: approved staff refactor
- Shared database/schema: preserved
- Shared tRPC infrastructure: preserved
- Payment router: preserved
- No new product functionality was intentionally introduced by the merge

## Combined architecture

The backend now has two complementary refactoring patterns.

### Member/Booking side

The old monolithic booking router is replaced with:

```text
src/server/routers/bookings/
├── index.ts
├── member.ts
└── staff.ts
```

`index.ts` composes the two procedure groups into the same public `bookings` router, so existing calls such as `trpc.bookings.mine` and `trpc.bookings.markAttended` remain available.

Shared booking rules are centralized in:

```text
src/server/routers/booking-rules.ts
```

This contains reusable logic for memberships, cancellation/refund rules, class capacity, waitlist promotion, and time calculations.

### Staff/Admin/Corporate side

Staff business logic is separated into:

```text
src/server/services/
├── admin-report-service.ts
├── company-service.ts
├── corporate-booking-service.ts
└── trainer-service.ts
```

The corresponding tRPC routers remain the API boundary and delegate domain logic to these services.

## Shared router

`src/server/routers/_app.ts` continues to expose:

- auth
- members
- plans
- classes
- bookings
- reschedules
- corporateBookings
- payments
- admin
- adminCompanies
- notifications
- trainers

The public router structure therefore remains compatible with the application.

## Shared files

The teammate's member-side versions of the following were integrated where they overlap with the base project:

- dashboard
- login
- notifications
- plans
- register
- schedule
- waitlist
- globals.css
- reschedule modal
- reschedules router

The new booking router directory replaces the old `src/server/routers/bookings.ts`.

## Database

No schema redesign was performed during the merge.

The existing Drizzle/SQLite model remains the source of truth.

## Validation performed

The merged project was checked for local TypeScript/TSX import resolution.

Result:

- No missing local `@/...` imports were found.
- No missing relative TypeScript imports were found.
- The combined booking router contains all seven original booking procedure names:
  - mine
  - book
  - cancel
  - markAttended
  - rosterFor
  - upcomingForMember
  - checkinCountFor
  - waitlisted

The reschedule router retains all three original procedures:

- reschedule
- history
- validateReschedule

A full dependency-backed Next.js build could not be completed in this environment because the package registry available to the environment does not provide the project's `@libsql/client` package. This is an environment/dependency-installation limitation, not a source-level merge error.

Before final submission, run the project's normal dependency installation and:

```text
pnpm build
pnpm lint
pnpm test
```

if those scripts are available in the repository.

## Final structure

The final project contains both vertical slices:

```text
FlexFit Studio
│
├── Member / Booking
│   ├── dashboard
│   ├── schedule
│   ├── plans
│   ├── waitlist
│   ├── notifications
│   ├── rescheduling
│   └── bookings router
│
├── Staff / Admin / Corporate
│   ├── admin dashboard
│   ├── reports
│   ├── attendance
│   ├── announcements
│   ├── companies
│   ├── corporate bookings
│   ├── trainers
│   ├── kiosk
│   └── payments
│
└── Shared
    ├── database
    ├── tRPC
    ├── authentication
    └── application configuration
```

## Merge principle

The merge prioritizes clear ownership and maintainability while preserving the existing external API and database structure. The main changes are organizational: related logic is grouped together, duplicated booking rules are centralized, and staff/admin business logic is separated from the tRPC routing layer.
