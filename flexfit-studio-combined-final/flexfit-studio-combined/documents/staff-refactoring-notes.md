# Staff Refactoring Notes

## Completed

- Extracted admin reporting/statistics logic from `admin.ts` into `admin-report-service.ts`.
- Extracted company management logic from `admin-companies.ts` into `company-service.ts`.
- Extracted corporate booking business logic from `corporate-bookings.ts` into `corporate-booking-service.ts`.
- Extracted trainer availability and schedule logic from `trainers.ts` into `trainer-service.ts`.
- Preserved all existing tRPC procedure names and input schemas.
- Preserved existing authorization checks and error messages.
- Preserved the existing database schema.
- Left `payments.ts` structurally unchanged.

## Intentionally not changed

- Member-side routers and pages owned by the other developer.
- Shared database schema and tRPC infrastructure.
- Payment/refund implementation.
- UI behavior where the existing page already had a clear single responsibility.

## Verification limitation in this environment

The repository uses pnpm, but the execution environment does not have pnpm installed and cannot reach the npm registry to install it. A global TypeScript compiler was available, but dependency packages were unavailable, so a full Next.js build/lint could not be executed here.

The refactor was therefore kept conservative and verified by source-level inspection. The project should be run with its normal pnpm workflow locally before merging.
