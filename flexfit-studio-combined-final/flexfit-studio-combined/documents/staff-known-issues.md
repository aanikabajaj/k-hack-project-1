# Staff Known Issues / Decisions

## Corporate waitlist credit behavior

The existing implementation promotes the oldest waitlisted corporate booking when a confirmed booking is cancelled. It sets the promoted booking's `creditsUsed` to the class credit cost and only deducts company credits when the company currently has enough balance. This behavior was preserved rather than redesigned because changing it could alter the application's current contract.

## Payment refunds

Payment/refund logic was intentionally preserved. Any change to refund semantics should be treated as a separate product/business decision and regression-tested independently.
