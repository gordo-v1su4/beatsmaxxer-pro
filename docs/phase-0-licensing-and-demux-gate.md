# Phase 0 licensing and demuxer gate

Captured: 2026-07-24  
Scope: hosted Aubio/Essentia analysis and the browser demux dependency

This document records engineering release gates from upstream license facts. It
is not legal advice and does not replace review by the relevant rights owner or
qualified counsel.

## Decision summary

| Component | Phase 0 decision | Release consequence |
| --- | --- | --- |
| Aubio | **HOLD** | No public/commercial analysis release until the actual deployment/conveyance model and GPL obligations receive written approval. |
| Essentia library | **HOLD** | No public/commercial analysis release until AGPL compliance or executed commercial terms are documented. |
| Essentia pretrained models | **HOLD** | No release until every deployed model is inventoried and its commercial rights are documented. |
| Essentia build dependencies | **HOLD** | No release until the deployed image has an SBOM, build flags, and cleared dependency obligations. |
| Mediabunny | **CONDITIONAL PASS FOR SPIKE ONLY** | It may enter a measured Phase 0 demux spike. This is not final dependency approval. |

The analysis licensing gate is a stop gate. The demuxer gate permits evaluation
only; it does not authorize adding the dependency or shipping it.

## Aubio

### Verified facts

- Aubio is licensed under
  [GNU GPL version 3 or later](https://github.com/aubio/aubio).
- The [official project site](https://aubio.org/) distinguishes this from
  permissive MIT/BSD licensing and directs commercial-product users to contact
  the author.
- No published commercial-license terms were found in the reviewed upstream
  materials.
- Ordinary GPLv3 does not add AGPL's remote-network source-offer condition.
  Merely running a copy on a server without conveying a copy is different from
  distributing a binary, container, client artifact, or combined program. See
  the [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#NoPublicSource).

### Required written decision

The release record must state:

1. the exact Aubio version/commit and build configuration;
2. whether the service is operated only by the same legal entity or whether a
   binary/container is conveyed to a hosting provider, customer, contractor, or
   other party;
3. whether Aubio and the service form a combined work for the intended build;
4. the corresponding-source, notice, and offer mechanism if conveyance occurs;
5. whether separate written terms from the author are required.

Until that record is approved, Aubio may not be treated as commercially cleared.

## Essentia library and models

### Verified facts

- Essentia is available under AGPLv3 and under proprietary terms on request.
  The official [Essentia licensing page](https://essentia.upf.edu/licensing_information.html)
  directs commercial users to Music Technology Group / Universitat Pompeu
  Fabra.
- GNU AGPLv3 section 13 requires a modified remotely interactive version to
  offer its Corresponding Source to remote users. See the
  [GNU AGPLv3 text](https://www.gnu.org/licenses/agpl-3.0.html.en).
- The scope of a combined/modified service and its Corresponding Source is a
  fact-specific legal decision, not an engineering inference.
- MTG-provided pretrained models are described as CC BY-NC-ND 4.0 for
  non-commercial use, with proprietary licensing available on request.
- Essentia documents third-party dependency obligations, including GPL FFTW
  (with alternatives), LGPL FFmpeg/Taglib/Chromaprint, and other libraries. UPF
  explicitly leaves clearance of required third-party rights to the integrator.

### Required written decision

Before public or commercial exposure, the release record must include:

1. an executed commercial license **or** an approved AGPL compliance plan;
2. the exact Essentia commit/image, local modifications, patches, and build
   flags;
3. a source-offer implementation if AGPL section 13 applies;
4. an inventory of every model file with filename, hash, source, task, and
   license;
5. an image SBOM covering FFT, media loading, TensorFlow, tag, fingerprinting,
   codec, and resampling dependencies;
6. notices, source availability, relinking/dynamic-linking, and attribution
   actions required by that exact build.

The presence of an open-source library license does not clear separately
licensed model weights.

## Demuxer review

The current repository has no demux dependency. Phase 0 should not add one until
the supported-container inventory and the exact V1 codec matrix are measured.

### Conditional spike selection: Mediabunny

Mediabunny `1.51.0` is the preferred Phase 0 spike candidate.

Upstream evidence:

- The [Mediabunny repository](https://github.com/Vanilagy/mediabunny) identifies
  MPL-2.0 licensing, browser operation, direct WebCodecs integration, streaming
  I/O, MP4/MOV/WebM/MKV support, and tree-shakable usage.
- Upstream describes best-case bundles as small as 5 kB gzipped. That is not a
  measurement of Beat Surfer's required MP4 + WebM import surface.
- The npm registry reported `1.51.0` as latest, published 2026-07-22, when this
  gate was captured.

Why it is preferred for the spike:

- one API covers both the planned MP4 lane and a WebM compatibility lane;
- it exposes WebCodecs-ready configuration/chunk concepts instead of requiring
  a complete project-owned adapter;
- it is actively released and supports lazy/streaming reads.

MPL-2.0 is file-level copyleft, not a blanket requirement to release unrelated
application files. Browser-delivered minified JavaScript is executable-form
distribution. The [Mozilla MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
requires recipients to be informed where the MPL-covered source is available;
distributed modifications to covered files must remain available under MPL.

Required spike gates:

1. preserve notices and add a legal/notices link to the exact upstream source;
2. do not patch Mediabunny files unless the modified MPL-covered source will be
   published as required;
3. measure the production bundle for the exact imports, not the upstream
   best-case number;
4. test MP4/H.264/AAC and WebM/VP8-or-VP9/Opus fixtures, timestamps, keyframe
   seeking, malformed inputs, memory release, and worker compatibility;
5. call `VideoDecoder.isConfigSupported()` for each exact decoder configuration;
6. record the selected version and integrity hash in the final ADR.

Failure of any gate rejects final adoption.

### Alternatives

#### mp4box.js `2.4.1`

[mp4box.js](https://github.com/gpac/mp4box.js) is BSD-3-Clause, has no runtime
dependencies in its current npm metadata, and supports progressive MP4 parsing
and encoded-sample extraction. It remains the fallback if the measured V1
inventory is strictly MP4 and its production bundle is materially smaller.

It is not the preferred cross-container spike because it does not demux WebM and
requires a project-owned WebCodecs adapter. Its smaller `simple` build omits
sample processing, so it cannot satisfy the decode extraction path by itself.

#### web-demuxer

`web-demuxer` is deferred. Its FFmpeg-derived WASM surface adds a substantially
larger download and mixed MIT/LGPL review. That conflicts with the default
minimal browser path unless the media inventory proves broader container support
is necessary.

## Evidence required to close Phase 0

- Approved rights/counsel record for Aubio, Essentia, models, and the exact
  service/container distribution model.
- Service image SBOM and reproducible dependency/build configuration.
- Executed proprietary terms or a verified open-source compliance/source-offer
  path.
- Container/codec inventory from representative project media.
- Measured Mediabunny spike results: bundle bytes, supported fixtures, seek and
  timestamp correctness, malformed-input behavior, and cleanup.
- Final ADR that either accepts Mediabunny with MPL actions, selects mp4box.js
  with an MP4-only scope, or rejects both with evidence.
