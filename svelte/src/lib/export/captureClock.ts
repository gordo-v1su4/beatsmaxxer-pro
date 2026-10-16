/** Relate MediaRecorder wall timestamps to the audio frames actually captured.
 * Silent PCM still has duration: only timestamp gaps/overlaps are removed. */
export class CaptureClock {
  private points: { source: number; target: number }[] = [];
  end = 0;
  drifted = false;

  add(timestamp: number, duration: number) {
    if (!this.points.length) this.end = timestamp;
    this.drifted ||= Math.abs(timestamp - this.end) > 0.1;
    this.points.push({ source: timestamp, target: this.end });
    this.end += duration;
  }

  map(timestamp: number): number {
    const points = this.points;
    if (!points.length || timestamp <= points[0].source) return timestamp;
    let low = 0, high = points.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (points[mid].source <= timestamp) low = mid;
      else high = mid - 1;
    }
    const point = points[low], next = points[low + 1];
    if (!next) return Math.min(this.end, point.target + timestamp - point.source);
    const fraction = (timestamp - point.source) / (next.source - point.source);
    return point.target + fraction * (next.target - point.target);
  }
}
