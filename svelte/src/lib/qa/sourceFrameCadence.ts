/** Self-contained so the native gate can serialize it into the WebView. */
export function createSourceFrameCadence(startMs:number) {
  let previous=startMs,callbacks=0,maxGapMs=0;
  return {
    frame(now:number) {
      const gap=Math.max(0,now-previous);
      maxGapMs=Math.max(maxGapMs,gap);previous=now;callbacks++;return gap;
    },
    finish(now:number) {
      const trailingGapMs=Math.max(0,now-previous);
      return {callbacks,maxGapMs:Math.max(maxGapMs,trailingGapMs),trailingGapMs};
    }
  };
}
