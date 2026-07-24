export type PlaybackLatencyKind =
  | "prewarmedSwitch"
  | "coldSwitch"
  | "cachedScrub"
  | "keyframeScrub"
  | "cleanup";

export type PlaybackDropReason =
  | "decoded-unavailable"
  | "decoded-off-target"
  | "video-not-ready"
  | "steady-drift"
  | "renderer-rejected";

export interface PlaybackLatencySummary {
  count: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  failures: number;
}

export interface PlaybackPerformanceSnapshot {
  latency: Record<PlaybackLatencyKind, PlaybackLatencySummary>;
  frames: {
    presented: number;
    late: number;
    dropped: number;
    droppedByReason: Record<PlaybackDropReason, number>;
    lateOrDroppedRatio: number | null;
  };
  longTasks: {
    count: number;
    maxMs: number | null;
  };
}

interface MeasurementToken {
  kind: PlaybackLatencyKind;
  startedAtMs: number;
  settled: boolean;
}

const LATENCY_KINDS: readonly PlaybackLatencyKind[] = [
  "prewarmedSwitch",
  "coldSwitch",
  "cachedScrub",
  "keyframeScrub",
  "cleanup",
];
const DROP_REASONS: readonly PlaybackDropReason[] = [
  "decoded-unavailable",
  "decoded-off-target",
  "video-not-ready",
  "steady-drift",
  "renderer-rejected",
];

function percentile(values: readonly number[], fraction: number) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(ordered.length * fraction));
  return ordered[rank - 1];
}

export class PlaybackPerformanceTracker {
  private readonly samples = new Map<
    PlaybackLatencyKind,
    number[]
  >(LATENCY_KINDS.map((kind) => [kind, []]));
  private readonly failures = new Map<
    PlaybackLatencyKind,
    number
  >(LATENCY_KINDS.map((kind) => [kind, 0]));
  private presented = 0;
  private late = 0;
  private dropped = 0;
  private readonly droppedByReason = new Map<PlaybackDropReason, number>(
    DROP_REASONS.map((reason) => [reason, 0]),
  );
  private readonly longTasks: number[] = [];

  constructor(private readonly now = () => performance.now()) {}

  begin(kind: PlaybackLatencyKind): MeasurementToken {
    return { kind, startedAtMs: this.now(), settled: false };
  }

  succeed(token: MeasurementToken) {
    if (token.settled) return;
    token.settled = true;
    this.samples.get(token.kind)?.push(
      Math.max(0, this.now() - token.startedAtMs),
    );
  }

  fail(token: MeasurementToken) {
    if (token.settled) return;
    token.settled = true;
    this.failures.set(
      token.kind,
      (this.failures.get(token.kind) ?? 0) + 1,
    );
  }

  recordFrame(
    options: {
      late?: boolean;
      dropped?: boolean;
      droppedReason?: PlaybackDropReason;
    } = {},
  ) {
    if (options.dropped) {
      this.dropped += 1;
      if (options.droppedReason) {
        this.droppedByReason.set(
          options.droppedReason,
          (this.droppedByReason.get(options.droppedReason) ?? 0) + 1,
        );
      }
      return;
    }
    this.presented += 1;
    if (options.late) this.late += 1;
  }

  recordLongTask(durationMs: number) {
    if (Number.isFinite(durationMs) && durationMs >= 50) {
      this.longTasks.push(durationMs);
    }
  }

  snapshot(): PlaybackPerformanceSnapshot {
    const latency = Object.fromEntries(
      LATENCY_KINDS.map((kind) => {
        const samples = this.samples.get(kind) ?? [];
        return [
          kind,
          {
            count: samples.length,
            p50Ms: percentile(samples, 0.5),
            p95Ms: percentile(samples, 0.95),
            maxMs: samples.length > 0 ? Math.max(...samples) : null,
            failures: this.failures.get(kind) ?? 0,
          },
        ];
      }),
    ) as Record<PlaybackLatencyKind, PlaybackLatencySummary>;
    const lateOrDropped = this.late + this.dropped;
    const attempted = this.presented + this.dropped;
    return {
      latency,
      frames: {
        presented: this.presented,
        late: this.late,
        dropped: this.dropped,
        droppedByReason: Object.fromEntries(
          DROP_REASONS.map((reason) => [
            reason,
            this.droppedByReason.get(reason) ?? 0,
          ]),
        ) as Record<PlaybackDropReason, number>,
        lateOrDroppedRatio:
          attempted > 0 ? lateOrDropped / attempted : null,
      },
      longTasks: {
        count: this.longTasks.length,
        maxMs:
          this.longTasks.length > 0
            ? Math.max(...this.longTasks)
            : null,
      },
    };
  }
}
