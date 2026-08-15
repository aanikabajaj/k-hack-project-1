# Staff / Admin / Corporate Behavior Baseline

This document records the existing staff-side behavior preserved during the refactor.

## Admin reporting

- `admin.stats` returns member, membership, upcoming class, paid revenue, check-in, and pending payment totals.
- `admin.classUtilisation` returns non-cancelled classes with booked counts and utilisation ratios.
- Revenue reports retain the existing paid-payment aggregation and ordering.
- Expiring memberships continue to cover active memberships expiring within 14 days.
- Refund counts continue to count payments with `refunded` status.
- Attendance reports continue to use the existing 14-day window.
- Top trainers and no-show results retain their existing filters, ordering, and limits.

## Corporate operations

- Corporate members can view their corporate bookings and optionally include past bookings.
- Booking validation, duplicate detection, active-company checks, credit checks, capacity checks, and waitlisting are preserved.
- Confirmed corporate bookings consume company credits exactly as before.
- Corporate cancellation retains the existing 24-hour free-cancellation rule.
- Confirmed cancellations continue to promote the oldest waitlisted booking.
- Staff can mark confirmed corporate bookings as attended.
- Staff can retrieve a class corporate roster.

## Company administration

- Admins can list and inspect companies.
- Company creation retains existing validation and default active status.
- Company activation/deactivation is unchanged.
- Company credit-pool top-ups are unchanged.
- Members can be linked/unlinked using the existing validation and error messages.

## Trainer operations

- Trainers can view upcoming classes and availability.
- Trainer availability can be created, updated, or removed by day.
- Trainer availability checks preserve the existing UTC time calculations and conflict detection.
- Only trainers can access trainer-owned availability operations; availability checking remains available to trainers and admins.

## Payments

`payments.ts` was intentionally left structurally unchanged because refund behavior is sensitive and already contained in a small, understandable router.
