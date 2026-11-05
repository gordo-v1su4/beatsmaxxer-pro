# Loop-seam GPU validation correction

Mac native Chrome stderr exposed a rejected external-image copy during deeper
profiling: `Destination texture needs CopyDst and RenderAttachment usage`.
The ordinary video texture had both flags, but the owned loop-seam texture
omitted `RENDER_ATTACHMENT`. The [WebGPU specification](https://gpuweb.github.io/gpuweb/#dom-gpuqueue-copyexternalimagetotexture)
requires both destination usages for this operation. A failed asynchronous
validation can leave a cached seam texture without the intended picture.

The unit GPU double now enforces that external-copy destination contract.
Three existing seam capture/reuse tests failed before the correction and all
seven cache tests pass afterward. All 90 rendering tests also pass. The fix
adds the missing usage bit; it does not change memory limits, source ownership,
cadence thresholds or seam timing policy.

Earlier November 5 cadence and input timings remain observations of their
recorded source revisions. Their zero browser-console/probe-error counts do
not establish absence of startup GPU validation errors. Do not use them as
clean-GPU release acceptance. Rerun candidate browser gates with a device error
listener installed before startup, preserve native stderr and inspect actual
seam pictures. The later fixed-source results belong below when available.
