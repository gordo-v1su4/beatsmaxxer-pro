import {
  CollapsibleSection,
  computeDAGLayout,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  useCanvasState,
  useHostTheme,
  useMemo,
  type DAGLayoutEdge,
} from "cursor/canvas";

type View = "frame" | "relay";

type Stage = {
  id: string;
  title: string;
  line: string;
  body: string;
};

const FRAME: Stage[] = [
  {
    id: "video",
    title: "Eight slots",
    line: "HTMLVideoElement",
    body: "Each rack slot owns its file, object URL, and decoder. Assigning a different effect does not reload the video. PGM points at one of these eight decoders instead of starting a ninth.",
  },
  {
    id: "import",
    title: "Import",
    line: "One GPU task",
    body: "WebGpuEngine imports the current video frame as a GPUExternalTexture and binds it in the same task. The external texture is not kept for the next frame. If the frame is not ready, the idle test card runs instead.",
  },
  {
    id: "shader",
    title: "WGSL effect",
    line: "Shared program",
    body: "One shader covers the catalog. effectMode picks the module. Knobs, beat phase, and bypass arrive from the same TimelineFrame that drove the audio.",
  },
  {
    id: "feedback",
    title: "Feedback",
    line: "Ping-pong pair",
    body: "Each canvas keeps a read texture and a write texture. The timeline says whether this frame advances the pair or resets it after a seek, a loop, or a pause.",
  },
  {
    id: "blit",
    title: "On screen",
    line: "Preview or PGM",
    body: "The result is blitted to that canvas. Eight previews and the program monitor share one GPUDevice. PgmDirector only changes which slot and which effect the program canvas reads.",
  },
];

const RELAY: Stage[] = [
  {
    id: "browser",
    title: "Browser",
    line: "MP3 only",
    body: "Analyze posts the song to a same-origin route. Playback does not wait on the reply. WAV files stay local and never take this path.",
  },
  {
    id: "route",
    title: "Same-origin route",
    line: "/__api/analyze",
    body: "Direct uploads stop at 4 MiB. A larger file is staged first, then this route receives a small JSON manifest instead of the whole MP3.",
  },
  {
    id: "chunks",
    title: "RustFS",
    line: "3 MiB parts",
    body: "Chunks land under media-uploads/source-audio/chunks. The function reassembles the original file. Nothing is downsampled. The hosted cap is 12 MiB.",
  },
  {
    id: "function",
    title: "Server function",
    line: "Key stays here",
    body: "The Vite dev proxy or the Vercel function adds X-API-Key and forwards the file to Essentia. The credential is not compiled into the browser bundle. The route checks origin, size, and concurrency before it spends the key.",
  },
  {
    id: "essentia",
    title: "Essentia",
    line: "BPM and grid",
    body: "The reply is BPM, musical key, confidence, and beat positions. Those values are validated before the transport uses them.",
  },
  {
    id: "local",
    title: "Web Audio",
    line: "If the relay is off",
    body: "Hosted analysis is disabled unless the server settings are set. If the call fails, the song keeps playing and local analysis supplies the beat energy.",
  },
];

const FRAME_EDGES = [
  { from: "video", to: "import" },
  { from: "import", to: "shader" },
  { from: "shader", to: "feedback" },
  { from: "feedback", to: "blit" },
];

const RELAY_EDGES = [
  { from: "browser", to: "route" },
  { from: "browser", to: "chunks" },
  { from: "route", to: "function" },
  { from: "chunks", to: "function" },
  { from: "function", to: "essentia" },
  { from: "browser", to: "local" },
];

const NODE_W = 156;
const NODE_H = 68;

function edgePath(edge: DAGLayoutEdge): string {
  const midX = (edge.sourceX + edge.targetX) / 2;
  return `M ${edge.sourceX} ${edge.sourceY} C ${midX} ${edge.sourceY}, ${midX} ${edge.targetY}, ${edge.targetX} ${edge.targetY}`;
}

function Pipeline({
  stages,
  edges,
  selected,
  onSelect,
}: {
  stages: Stage[];
  edges: Array<{ from: string; to: string }>;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const theme = useHostTheme();
  const layout = useMemo(
    () =>
      computeDAGLayout({
        nodes: stages.map((stage) => ({ id: stage.id })),
        edges,
        direction: "horizontal",
        nodeWidth: NODE_W,
        nodeHeight: NODE_H,
        rankGap: 56,
        nodeGap: 28,
        padding: 2,
      }),
    [stages, edges],
  );
  const byId = new Map(stages.map((stage) => [stage.id, stage]));

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ position: "relative", width: layout.width, height: layout.height }}>
        <svg
          width={layout.width}
          height={layout.height}
          style={{ position: "absolute", inset: 0 }}
        >
          {layout.edges.map((edge) => {
            const hot = edge.from === selected || edge.to === selected;
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={edgePath(edge)}
                fill="none"
                stroke={hot ? theme.accent.primary : theme.stroke.primary}
                strokeWidth={1}
              />
            );
          })}
        </svg>
        {layout.nodes.map((node) => {
          const stage = byId.get(node.id);
          if (!stage) return null;
          const active = node.id === selected;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node.id)}
              style={{
                position: "absolute",
                left: node.x,
                top: node.y,
                width: NODE_W,
                height: NODE_H,
                margin: 0,
                padding: "10px 12px",
                textAlign: "left",
                cursor: "pointer",
                background: active ? theme.fill.tertiary : theme.bg.elevated,
                color: theme.text.primary,
                border: `1px solid ${theme.stroke.secondary}`,
                borderLeft: `3px solid ${active ? theme.accent.primary : theme.stroke.primary}`,
                borderRadius: 0,
              }}
            >
              <div style={{ fontSize: 11, lineHeight: "14px", color: theme.text.tertiary }}>{stage.line}</div>
              <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, lineHeight: "16px" }}>{stage.title}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StageReading({ stage, view }: { stage: Stage; view: View }) {
  const theme = useHostTheme();
  const aside =
    view === "frame"
      ? "One requestAnimationFrame publishes a single TimelineFrame from the AudioContext. Audio, video seek, shader parameters, and the program cut all read that snapshot."
      : "The relay stays off until the Essentia URL and key are set on the server. If the call fails, the song keeps playing on Web Audio.";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.5fr) minmax(200px, 0.8fr)",
        gap: 32,
        paddingTop: 16,
        borderTop: `1px solid ${theme.stroke.tertiary}`,
      }}
    >
      <Stack gap={6}>
        <Text size="small" tone="tertiary">
          {stage.line}
        </Text>
        <H2>{stage.title}</H2>
        <Text>{stage.body}</Text>
      </Stack>
      <Text size="small" tone="secondary" style={{ paddingTop: 28, maxWidth: 320 }}>
        {aside}
      </Text>
    </div>
  );
}

export default function PortfolioCaseStudy() {
  const [view, setView] = useCanvasState<View>("case-study-view", "frame");
  const [selected, setSelected] = useCanvasState<string>("case-study-stage", "shader");
  const stages = view === "frame" ? FRAME : RELAY;
  const stage = stages.find((item) => item.id === selected) ?? stages[0];

  return (
    <Stack gap={22}>
      <Row justify="space-between" align="end">
        <Stack gap={6} style={{ maxWidth: 520 }}>
          <H1>Beatsmaxxer Pro</H1>
          <Text tone="secondary">
            The picture, the clock, and the program cut stay on the machine. A server is used only
            when you ask it to read the song.
          </Text>
        </Stack>
        <Row gap={20}>
          <Stat value="8" label="Live decoders" />
          <Stat value="1" label="Shared clock" />
          <Stat value="PGM" label="Reuses a slot" />
        </Row>
      </Row>

      <Row gap={8} align="center">
        <Pill
          active={view === "frame"}
          onClick={() => {
            setView("frame");
            setSelected("shader");
          }}
        >
          Frame path
        </Pill>
        <Pill
          active={view === "relay"}
          onClick={() => {
            setView("relay");
            setSelected("function");
          }}
        >
          Analysis relay
        </Pill>
        <Text size="small" tone="tertiary" style={{ marginLeft: 8 }}>
          Select a stage
        </Text>
      </Row>

      <Pipeline
        stages={stages}
        edges={view === "frame" ? FRAME_EDGES : RELAY_EDGES}
        selected={stage.id}
        onSelect={setSelected}
      />

      <StageReading stage={stage} view={view} />

      <CollapsibleSection title="Who owns what" count={7}>
        <Table
          framed={false}
          striped
          headers={["Concern", "Owner", "What it means"]}
          rows={[
            ["Cadence", "AppLoop", "One animation loop for the whole show"],
            ["Clock", "AudioTimeline", "Transport time comes from the AudioContext"],
            ["Song", "AudioEngine", "Playback, SoundTouch, and energy stay local"],
            ["Clips", "VideoPool", "Eight elements, replaced only after the next frame is ready"],
            ["Picture", "WebGpuEngine", "One device, WGSL only"],
            ["Program cut", "PgmDirector", "A beat switch onto an existing slot"],
            ["Rhythm service", "Essentia relay", "Optional. Failure leaves playback running"],
          ]}
        />
        <Text size="small" tone="tertiary">
          Source: svelte/docs/ARCHITECTURE.md and svelte/docs/ESSENTIA.md
        </Text>
      </CollapsibleSection>
    </Stack>
  );
}
