/**
 * The little "panel" message strip used everywhere to report a mutation's
 * error or success - dashboard, schedule, waitlist, plans, login and the
 * reschedule modal all used to build this by hand with an inline `color:
 * "#f87171"` (or "#4ade80"). One component, and the color now comes from
 * the theme tokens in globals.css instead of a hardcoded hex.
 */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="panel p-3 text-sm" style={{ color: "var(--danger)" }}>
      {message}
    </p>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <p className="panel p-3 text-sm" style={{ color: "var(--accent)" }}>
      {message}
    </p>
  );
}
