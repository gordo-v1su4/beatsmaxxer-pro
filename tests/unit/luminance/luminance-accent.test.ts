import { describe, expect, test } from "bun:test";
import {
  LUMINANCE_ACCENT_DURATION_MS,
  applyLuminanceAccent,
  luminanceAccentEnvelope,
  relativeLuminance,
  rgbToHsv,
  type Rgb,
} from "../../../src/render/luminanceAccent";

const GOLDEN_PIXELS: readonly Rgb[] = [
  [0.12, 0.18, 0.24],
  [0.42, 0.21, 0.08],
  [0.18, 0.52, 0.31],
  [0.35, 0.28, 0.62],
  [0.68, 0.61, 0.44],
];

function angularDistance(left: number, right: number) {
  const delta = Math.abs(left - right) % 360;
  return Math.min(delta, 360 - delta);
}

describe("G004 luminance accent envelope", () => {
  test("matches the deterministic cubic decay golden vector", () => {
    expect(
      [0, 60, 120, 180, 239, 240, 250].map(
        luminanceAccentEnvelope,
      ),
    ).toEqual([
      1,
      0.421875,
      0.125,
      0.015625,
      7.23379629629622e-8,
      0,
      0,
    ]);
  });

  test("restores a neutral output before 250 ms", () => {
    const source: Rgb = [0.24, 0.48, 0.72];
    expect(LUMINANCE_ACCENT_DURATION_MS).toBeLessThan(250);
    expect(
      applyLuminanceAccent(
        source,
        luminanceAccentEnvelope(LUMINANCE_ACCENT_DURATION_MS),
      ),
    ).toEqual(source);
    expect(
      applyLuminanceAccent(source, luminanceAccentEnvelope(250)),
    ).toEqual(source);
  });
});

describe("G004 luminance accent color gates", () => {
  test("golden pixels receive an 8-25% peak luminance lift", () => {
    for (const source of GOLDEN_PIXELS) {
      const accented = applyLuminanceAccent(source, 1);
      const lift =
        relativeLuminance(accented) / relativeLuminance(source) - 1;
      expect(lift).toBeGreaterThanOrEqual(0.08);
      expect(lift).toBeLessThanOrEqual(0.25);
    }
  });

  test("golden pixels stay within hue and saturation tolerances", () => {
    for (const source of GOLDEN_PIXELS) {
      const accented = applyLuminanceAccent(source, 1);
      const before = rgbToHsv(source);
      const after = rgbToHsv(accented);

      expect(angularDistance(before.hue, after.hue)).toBeLessThanOrEqual(3);
      expect(
        Math.abs(after.saturation - before.saturation),
      ).toBeLessThanOrEqual(0.05);
    }
  });

  test("deterministic stress pixels keep clipping below 0.1%", () => {
    const pixels: Rgb[] = [];
    let state = 0x12345678;
    for (let index = 0; index < 10_000; index += 1) {
      const channels: number[] = [];
      for (let channel = 0; channel < 3; channel += 1) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        channels.push((state >>> 0) / 0xffffffff);
      }
      pixels.push(channels as [number, number, number]);
    }

    const clipped = pixels
      .map((pixel) => applyLuminanceAccent(pixel, 1))
      .filter((pixel) => pixel.some((channel) => channel >= 1))
      .length;
    expect(clipped / pixels.length).toBeLessThanOrEqual(0.001);
  });

  test("golden pixel output is stable", () => {
    expect(
      GOLDEN_PIXELS.map((pixel) =>
        applyLuminanceAccent(pixel, 1).map((channel) =>
          Number(channel.toFixed(6)),
        ),
      ),
    ).toEqual([
      [0.1392, 0.2088, 0.2784],
      [0.4872, 0.2436, 0.0928],
      [0.2088, 0.6032, 0.3596],
      [0.406, 0.3248, 0.7192],
      [0.7888, 0.7076, 0.5104],
    ]);
  });
});
