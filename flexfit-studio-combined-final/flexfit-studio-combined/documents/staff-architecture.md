# Staff / Admin / Corporate Architecture

## Refactoring approach

The staff-side refactor separates API boundaries from business logic without changing the public tRPC procedure names, inputs, outputs, authorization rules, database schema, or user-visible behavior.

### Routers

The tRPC routers remain the API boundary. They now perform input validation and delegate the operation to focused services.

### Services

Business logic is grouped by domain:

- `admin-report-service.ts` — admin dashboard and reporting queries.
- `company-service.ts` — company management and company-member operations.
- `corporate-booking-service.ts` — corporate booking, cancellation, attendance, and roster behavior.
- `trainer-service.ts` — trainer schedule, availability, and availability checks.

### Database

The existing Drizzle schema and database structure were deliberately preserved. The task prioritizes behavioral compatibility, so there was no schema migration or data-model redesign.

### Payments

The payments router was left unchanged. Its refund path is security/business sensitive, short, and already sufficiently focused; changing it would add risk without a corresponding structural benefit.

## Ownership boundary

This refactor is limited to the Staff/Admin/Corporate vertical slice. Member-side booking, class, plan, notification, member, and rescheduling routers were not changed.
