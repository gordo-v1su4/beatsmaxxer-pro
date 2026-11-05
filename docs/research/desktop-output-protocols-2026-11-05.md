# Desktop output protocol investigation

Scope: Pro Experimental Desktop V1S-205/207/208/209. The separate Native
application is excluded. This note is a design input, not implemented output
or physical acceptance.

## Verified protocol constraints

The current [Art-Net 4 specification, revision 1.4dp](https://art-net.org.uk/downloads/art-net.pdf)
defines ArtDmx as unicast to subscribed universes, prohibits ArtDmx broadcast,
and requires controllers to refresh subscriber discovery using ArtPoll.
ArtPollReply reports the receiver refresh limit; DMX512 gateways support at
most 44 Hz. ArtSync can coordinate multiple universes. See specification pages
62–67 (PDF pages 72–77). Therefore a proposed 40 Hz output must honor the
receiver limit, and sending arbitrary broadcast packets is not a conformant
implementation. Discovery, subscriber lifetime and synchronization belong in
the Rust output service, separate from GPU sampling.

ESTA publishes [ANSI E1.31-2018](https://tsp.esta.org/tsp/documents/docs/ANSI_E1-31-2018.pdf)
for sACN. The publisher returned HTTP 403 during this investigation. Packet
layout and lifecycle requirements have not been verified from its contents;
do not substitute remembered offsets for an implementation review.

## Proposed boundary and acceptance

GPU mapping/sampling consumes the existing composited PGM and its frame/beat
identity. A bounded readback queue must discard superseded samples rather than
block playback or enqueue stale lighting. Rust owns UDP, subscriber state,
output rate, sequence, stop behavior and diagnostics. Outputs stay disabled
until explicitly configured. Web preview can show fixture values without
pretending browser UDP is available.

The actual rig, protocol and console ownership are still being clarified.
Loopback packet tests can establish encoding and scheduling, but cannot prove
fixture latency, viewer interoperability or two-display edge blending.
V1S-207 requires two real outputs at 60 FPS with eight decks. V1S-208 requires
an independent QLC+/sACN viewer at at least 40 Hz plus measured trigger-to-light
latency. Preserve those gates; do not relabel a unit test as hardware acceptance.

Web responsiveness, media and UI work remain the first implementation lane.
