'use client';

/**
 * OrderStepper — horizontal progress stepper for an order's lifecycle.
 *
 * Renders the Paberin order flow as a row of numbered nodes with a
 * filling track. `current` is the state the order is in right now;
 * everything before it is marked done, everything after is pending.
 *
 * Purely presentational — no data fetching, no side effects.
 */

const FLOW = [
  'PAYMENT_SUCCESS',
  'IN_PROGRESS',
  'CUTTING',
  'QC',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

const LABELS: Record<string, string> = {
  PAYMENT_SUCCESS: 'Confirmed',
  IN_PROGRESS: 'In Prod',
  CUTTING: 'Cutting',
  QC: 'QC',
  READY_FOR_PICKUP: 'Ready',
  OUT_FOR_DELIVERY: 'Out',
  DELIVERED: 'Done',
};

interface OrderStepperProps {
  /** The order's current state, e.g. 'CUTTING'. */
  current: string;
  /** Smaller node size for tight layouts. */
  compact?: boolean;
  className?: string;
}

export function OrderStepper({ current, compact = false, className = '' }: OrderStepperProps) {
  // Terminal/cancelled states — render nothing (no progress to show).
  const terminal = ['CANCELLED', 'REFUNDED', 'PAYMENT_PENDING', 'ON_HOLD', 'COMPLETED'];
  if (terminal.includes(current)) return null;

  const currentIdx = FLOW.indexOf(current as (typeof FLOW)[number]);
  // If the state isn't in our flow, fall back to 0 so it still renders.
  const safeIdx = currentIdx === -1 ? 0 : currentIdx;

  return (
    <div className={className}>
      <div className="stepper">
        {FLOW.map((state, i) => {
          const done = i < safeIdx;
          const isCurrent = i === safeIdx;
          return (
            <div className="stepper-step" key={state}>
              <div
                className={`stepper-node ${compact ? 'w-6 h-6 text-[10px]' : ''} ${
                  done ? 'stepper-node-done' : ''
                } ${isCurrent ? 'stepper-node-current' : ''}`}
              >
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`stepper-label ${isCurrent || done ? 'stepper-label-active' : ''}`}
              >
                {LABELS[state] ?? state}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
