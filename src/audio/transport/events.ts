export type TransportDiscontinuityReason =
  | "play"
  | "pause"
  | "seek"
  | "loop-wrap"
  | "source-change";

interface TransportEventBase {
  sequence: number;
  transportSeconds: number;
}

export interface TransportDiscontinuityEvent extends TransportEventBase {
  type: "transport-discontinuity";
  reason: TransportDiscontinuityReason;
  generation: number;
  fromSeconds: number;
  toSeconds: number;
}

export interface SourceMapChangeEvent extends TransportEventBase {
  type: "source-map-change";
  durationSeconds?: number;
  sliceCount?: number;
}

export interface ScheduledParameterChangeEvent extends TransportEventBase {
  type: "scheduled-parameter-change";
  parameter: "mode" | "jump-size" | "loop-count";
  value: unknown;
}

export interface ImmediateParameterChangeEvent extends TransportEventBase {
  type: "immediate-parameter-change";
  parameter: "rate" | "accent-mode" | "bpm" | "beat-grid";
  value: unknown;
}

export interface TriggerEvent extends TransportEventBase {
  type: "manual-trigger" | "midi-trigger" | "onset-trigger";
}

export interface ScheduledBoundaryEvent extends TransportEventBase {
  type: "scheduled-boundary";
  boundaryIndex: number;
}

export type TransportEvent =
  | TransportDiscontinuityEvent
  | SourceMapChangeEvent
  | ScheduledParameterChangeEvent
  | ImmediateParameterChangeEvent
  | TriggerEvent
  | ScheduledBoundaryEvent;

const EVENT_PRIORITY: Record<TransportEvent["type"], number> = {
  "transport-discontinuity": 0,
  "source-map-change": 1,
  "scheduled-parameter-change": 2,
  "immediate-parameter-change": 2,
  "manual-trigger": 3,
  "midi-trigger": 4,
  "onset-trigger": 5,
  "scheduled-boundary": 6,
};

/**
 * Stable total order consumed by the TimeSampler reducer.
 *
 * Sequence is the final tie-breaker so repeated events of the same kind keep
 * their enqueue order.
 */
export function orderTransportEvents(events: readonly TransportEvent[]): TransportEvent[] {
  return [...events].sort((left, right) => {
    const priorityDifference = EVENT_PRIORITY[left.type] - EVENT_PRIORITY[right.type];
    return priorityDifference || left.sequence - right.sequence;
  });
}
