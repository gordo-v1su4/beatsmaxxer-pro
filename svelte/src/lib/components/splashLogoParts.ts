/**
 * Splits the traced wordmark into the pieces the splash animates on their
 * own: BEATS, MAXXER and the underline swoosh.
 *
 * The trace is one even-odd path of closed polygons. Counters (the holes in
 * A, E, R...) are separate subpaths that only cut a hole while they share a
 * path with the letter around them, so each subpath goes with its outermost
 * enclosing shape, and those shapes are sorted by where they sit.
 */
import type { SplashLogo } from './splashLogoPaths';

/** Board x between the S of BEATS and the M of MAXXER. */
const WORD_SPLIT_X = 1040;

export interface SplashLogoParts {
  beats: string;
  maxxer: string;
  swoosh: string;
  pro: string;
}

/** Largest bbox area a stray sliver can have and still count as a line tip. */
const TIP_MAX_AREA = 2000;

type Point = [number, number];

interface Shape {
  d: string;
  points: Point[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function parseShapes(path: string): Shape[] {
  return path
    .split('Z')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const nums = s.replace(/M/g, ' ').trim().split(/\s+/).map(Number);
      const points: Point[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);
      return {
        d: `${s}Z`,
        points,
        x0: Math.min(...xs),
        x1: Math.max(...xs),
        y0: Math.min(...ys),
        y1: Math.max(...ys)
      };
    });
}

function contains(shape: Shape, [x, y]: Point) {
  if (x < shape.x0 || x > shape.x1 || y < shape.y0 || y > shape.y1) return false;
  let inside = false;
  const pts = shape.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function splitWordmark(logo: SplashLogo): SplashLogoParts {
  const shapes = parseShapes(logo.word);
  // Outermost enclosing shape of each subpath (itself when nothing encloses it).
  const rootOf = shapes.map((shape) => {
    let root = shape;
    for (const other of shapes) {
      if (other === shape) continue;
      const larger = (other.x1 - other.x0) * (other.y1 - other.y0) > (root.x1 - root.x0) * (root.y1 - root.y0);
      if (larger && contains(other, shape.points[0])) root = other;
    }
    return root;
  });

  const parts: Record<keyof SplashLogoParts, string[]> = { beats: [], maxxer: [], swoosh: [], pro: [] };
  const swooshShapes: Shape[] = [];
  shapes.forEach((shape, i) => {
    const root = rootOf[i];
    const w = root.x1 - root.x0;
    const h = root.y1 - root.y0;
    // The underline is the one long, flat shape.
    const key: keyof SplashLogoParts =
      w > 500 && h < 100 ? 'swoosh' : (root.x0 + root.x1) / 2 < WORD_SPLIT_X ? 'beats' : 'maxxer';
    parts[key].push(shape.d);
    if (key === 'swoosh' && root === shape) swooshShapes.push(shape);
  });

  // The trace put the underline's last sliver, touching the P, into PRO. It
  // belongs to the line: left in PRO it flies off with the stamp.
  const touchesSwoosh = (s: Shape) =>
    swooshShapes.some((l) => s.x0 <= l.x1 + 4 && s.x1 >= l.x0 && s.y0 <= l.y1 && s.y1 >= l.y0);
  for (const shape of parseShapes(logo.pro)) {
    const area = (shape.x1 - shape.x0) * (shape.y1 - shape.y0);
    parts[area < TIP_MAX_AREA && touchesSwoosh(shape) ? 'swoosh' : 'pro'].push(shape.d);
  }

  return {
    beats: parts.beats.join(''),
    maxxer: parts.maxxer.join(''),
    swoosh: parts.swoosh.join(''),
    pro: parts.pro.join('')
  };
}
