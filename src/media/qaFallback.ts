export function isHtmlVideoQaFallbackEnabled() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("qaFallback") === "html-video-webgl2";
}
