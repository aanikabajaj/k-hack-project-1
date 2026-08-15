import { formatDate } from "@/lib/format";
import type { RouterOutputs } from "@/lib/trpc-types";
import { UNLIMITED_CREDITS } from "@/lib/constants";

type Membership = RouterOutputs["members"]["profile"]["membership"];

export function MembershipCard({ membership }: { membership: Membership }) {
  return (
    <section className="panel p-5">
      <h2 className="font-medium">Membership</h2>
      {membership ? (
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="muted">Plan</dt>
            <dd>{membership.planName}</dd>
          </div>
          <div>
            <dt className="muted">Status</dt>
            <dd>{membership.status}</dd>
          </div>
          <div>
            <dt className="muted">Valid until</dt>
            <dd>{formatDate(membership.endDate)}</dd>
          </div>
          <div>
            <dt className="muted">Credits</dt>
            <dd>
              {membership.creditsRemaining >= UNLIMITED_CREDITS
                ? "Unlimited"
                : membership.creditsRemaining}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="muted mt-2 text-sm">
          No active membership. Pick a plan to start booking classes.
        </p>
      )}
    </section>
  );
}
