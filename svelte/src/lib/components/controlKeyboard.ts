export function sliderValueForKey(
  key: string,
  value: number,
  min: number,
  max: number,
  step = 1,
  pageStep = 10
): number | null {
  let next: number;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      next = value + step;
      break;
    case 'ArrowLeft':
    case 'ArrowDown':
      next = value - step;
      break;
    case 'PageUp':
      next = value + pageStep;
      break;
    case 'PageDown':
      next = value - pageStep;
      break;
    case 'Home':
      next = min;
      break;
    case 'End':
      next = max;
      break;
    default:
      return null;
  }
  return Math.max(min, Math.min(max, next));
}
