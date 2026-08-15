"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDateTime, formatTime } from "@/lib/format";
import { ErrorBanner } from "@/components/ui/Banner";
import type { RouterOutputs } from "@/lib/trpc-types";

interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromBookingId: number;
  fromClassId: number;
  fromClassName: string;
  fromClassTime: string;
  onSuccess: () => void;
}

type ClassOption = RouterOutputs["classes"]["list"][number];

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Local-calendar-day key (not the ISO date) so grouping lines up with the
// grid below, which is also built from local Date fields.
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// 6 weeks x 7 days, padded with nulls before day 1 and after the last day.
function buildCalendarGrid(monthStart: Date): (Date | null)[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const leadingBlanks = monthStart.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function RescheduleModal({
  isOpen,
  onClose,
  fromBookingId,
  fromClassId,
  fromClassName,
  fromClassTime,
  onSuccess,
}: RescheduleModalProps) {
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [error, setError] = useState<string | null>(null);
  // Computed fresh each time the modal opens, then held stable while it's
  // open - recomputing it inline on every render would give react-query a
  // new query input on every render and the fetch would never settle.
  const [fromISO, setFromISO] = useState(() => new Date().toISOString());

  const utils = trpc.useUtils();

  useEffect(() => {
    if (isOpen) {
      setFromISO(new Date().toISOString());
      setCalendarMonth(startOfMonth(new Date()));
      setSelectedDateKey(null);
      setSelectedClassId(null);
      setError(null);
    }
  }, [isOpen]);

  const { data: availableClasses } = trpc.classes.list.useQuery(
    { from: fromISO },
    { enabled: isOpen },
  );

  // Same-name classes, excluding the one already booked - the backend
  // rejects rescheduling to your own class anyway, but there's no reason
  // to offer it as a pickable option in the first place.
  const sameNameClasses = useMemo(
    () => (availableClasses || []).filter((cls) => cls.name === fromClassName && cls.id !== fromClassId),
    [availableClasses, fromClassName, fromClassId],
  );

  const classesByDate = useMemo(() => {
    const map = new Map<string, ClassOption[]>();
    for (const cls of sameNameClasses) {
      const key = dateKey(new Date(cls.startsAt));
      const bucket = map.get(key);
      if (bucket) bucket.push(cls);
      else map.set(key, [cls]);
    }
    return map;
  }, [sameNameClasses]);

  const grid = useMemo(() => buildCalendarGrid(calendarMonth), [calendarMonth]);
  const todayKey = dateKey(new Date());
  const selectedDateClasses = selectedDateKey ? classesByDate.get(selectedDateKey) ?? [] : [];
  const selectedClass = sameNameClasses.find((c) => c.id === selectedClassId) ?? null;

  const canGoToPrevMonth = calendarMonth.getTime() > startOfMonth(new Date()).getTime();

  const reschedule = trpc.reschedules.reschedule.useMutation({
    onSuccess: async () => {
      await utils.bookings.mine.invalidate();
      await utils.bookings.waitlisted.invalidate();
      await utils.reschedules.history.invalidate();
      await utils.classes.list.invalidate();
      setSelectedClassId(null);
      setSelectedDateKey(null);
      onClose();
      onSuccess();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  if (!isOpen) return null;

  function pickDate(key: string) {
    setSelectedDateKey(key);
    const options = classesByDate.get(key) ?? [];
    // Only one class that day - select it right away instead of making
    // the member click twice.
    setSelectedClassId(options.length === 1 ? options[0].id : null);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        className="panel space-y-4 p-6"
        style={{ maxWidth: "440px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold">Reschedule class</h2>
          <p className="muted mt-1 text-sm">
            Moving: {fromClassName} on {formatDateTime(fromClassTime)}
          </p>
        </div>

        {error && <ErrorBanner message={error} />}

        {sameNameClasses.length ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="btn btn-sm"
                disabled={!canGoToPrevMonth}
                onClick={() =>
                  setCalendarMonth(
                    (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
                  )
                }
              >
                ‹
              </button>
              <span className="text-sm font-medium">
                {calendarMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  setCalendarMonth(
                    (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
                  )
                }
              >
                ›
              </button>
            </div>

            <div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="muted text-xs py-1">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {grid.map((date, idx) => {
                  if (!date) return <div key={idx} />;
                  const key = dateKey(date);
                  const hasClasses = classesByDate.has(key);
                  const isSelected = selectedDateKey === key;
                  const isToday = key === todayKey;

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={!hasClasses || reschedule.isPending}
                      onClick={() => pickDate(key)}
                      className="rounded text-sm py-1.5"
                      style={{
                        background: isSelected
                          ? "var(--accent)"
                          : hasClasses
                            ? "var(--warning-bg)"
                            : "transparent",
                        color: isSelected ? "#07120b" : hasClasses ? "var(--text)" : "var(--muted)",
                        border: isToday ? "1px solid var(--accent)" : "1px solid transparent",
                        cursor: hasClasses ? "pointer" : "default",
                        fontWeight: isSelected ? 600 : 400,
                        opacity: hasClasses ? 1 : 0.4,
                      }}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
              <p className="muted mt-2 text-xs">
                Highlighted dates have a {fromClassName} class available.
              </p>
            </div>

            {selectedDateKey && selectedDateClasses.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Pick a time</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedDateClasses.map((cls) => (
                    <button
                      key={cls.id}
                      type="button"
                      className="panel w-full p-2.5 text-left text-sm"
                      onClick={() => setSelectedClassId(cls.id)}
                      style={{
                        border:
                          selectedClassId === cls.id
                            ? "2px solid var(--accent)"
                            : "1px solid transparent",
                      }}
                      disabled={reschedule.isPending}
                    >
                      <div className="flex items-center gap-2">
                        <span>{formatTime(cls.startsAt)}</span>
                        <span className="muted">· {cls.room}</span>
                        {(cls.full || (cls.spotsLeft ?? 0) === 0) && (
                          <span
                            className="rounded px-1.5 py-0.5 text-xs"
                            style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                          >
                            Waitlist
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedClass && (
              <div className="panel p-3 text-sm">
                <span className="muted">Rescheduling to: </span>
                {formatDateTime(selectedClass.startsAt)} · {selectedClass.room}
                {(selectedClass.full || (selectedClass.spotsLeft ?? 0) === 0) && (
                  <span
                    className="ml-2 rounded px-1.5 py-0.5 text-xs"
                    style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                  >
                    You'll be waitlisted
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="muted text-sm text-center py-4">
            No other {fromClassName} classes available
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            className="btn"
            disabled={reschedule.isPending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!selectedClassId || reschedule.isPending}
            onClick={() => {
              if (selectedClassId) {
                reschedule.mutate({
                  fromBookingId,
                  toClassId: selectedClassId,
                });
              }
            }}
          >
            {reschedule.isPending ? "Rescheduling..." : "Reschedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
