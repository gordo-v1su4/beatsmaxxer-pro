import { createBrowserVideoDecoderFactory } from '$lib/media/browserDecode';
import type { RegisteredClip } from '$lib/media/ClipRegistry';
import {
	WebCodecsClipDecoder,
	type ClipDecoderState
} from '$lib/media/decoder/WebCodecsClipDecoder';
import type { Mp4DemuxBoundary } from '$lib/media/demux/mp4';
import {
	PlaybackCoordinator,
	type PlaybackLaneRole
} from '$lib/media/PlaybackCoordinator';
import type { ClipAsset } from '$lib/media/types';

interface LaneDecoder {
	clipId: string;
	generation: number;
	decoder: WebCodecsClipDecoder<VideoFrame>;
}

export class DecodeScheduler {
	private readonly assets = new Map<string, ClipAsset>();
	private readonly lanes = new Map<PlaybackLaneRole, LaneDecoder>();
	private readonly loading = new Map<string, Promise<ClipAsset>>();
	private disposed = false;

	constructor(
		private readonly coordinator: PlaybackCoordinator<VideoFrame>,
		private readonly demux: Mp4DemuxBoundary,
		private readonly onDecoderState?: (state: ClipDecoderState, queueSize: number | null) => void
	) {}

	async loadClip(clip: RegisteredClip, signal?: AbortSignal) {
		const cached = this.assets.get(clip.id);
		if (cached) return cached;
		const pending = this.loading.get(clip.id);
		if (pending) return pending;

		const promise = (async () => {
			const response = await fetch(clip.url, { signal });
			if (!response.ok) {
				throw new Error(`clip-fetch-failed:${response.status}`);
			}
			const bytes = await response.arrayBuffer();
			const asset = await this.demux.demux(clip.id, bytes, signal);
			this.assets.set(clip.id, asset);
			return asset;
		})();

		this.loading.set(clip.id, promise);
		try {
			return await promise;
		} finally {
			this.loading.delete(clip.id);
		}
	}

	async ensurePresentationFrame(options: {
		role: PlaybackLaneRole;
		clip: RegisteredClip;
		generation: number;
		timestampUs: number;
	}) {
		this.assertOpen();
		const asset = await this.loadClip(options.clip);
		const lane = this.ensureLane(options.role, options.clip.id, options.generation);
		const existing = this.coordinator.leaseFrame(
			options.role,
			options.timestampUs,
			'decode-scheduler-probe'
		);
		if (existing) {
			existing.release();
			return;
		}

		await lane.decoder.decodeForward(asset, options.timestampUs);
	}

	syncLane(role: PlaybackLaneRole, clip: RegisteredClip | null, generation: number) {
		if (!clip) {
			this.disposeLane(role);
			return;
		}
		const lane = this.lanes.get(role);
		if (lane && lane.clipId === clip.id && lane.generation === generation) {
			return;
		}
		this.ensureLane(role, clip.id, generation);
	}

	disposeLane(role: PlaybackLaneRole) {
		const lane = this.lanes.get(role);
		if (!lane) return;
		lane.decoder.close();
		this.lanes.delete(role);
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		for (const role of ['pgm', 'prewarm', 'overlap'] as const) {
			this.disposeLane(role);
		}
		this.assets.clear();
		this.loading.clear();
	}

	private ensureLane(role: PlaybackLaneRole, clipId: string, generation: number) {
		const existing = this.lanes.get(role);
		if (existing && existing.clipId === clipId && existing.generation === generation) {
			return existing;
		}
		if (existing) {
			existing.decoder.close();
		}

		const decoder = new WebCodecsClipDecoder<VideoFrame>({
			factory: createBrowserVideoDecoderFactory((frame) => frame),
			onFrame: (frame, context) => {
				this.coordinator.insertFrame(
					role,
					{
						clipId: context.clipId,
						generation: context.generation,
						timestampUs: frame.timestamp
					},
					frame,
					frame.duration ?? undefined
				);
			},
			onStateChange: (state, queueSize) => {
				this.onDecoderState?.(state, queueSize);
			}
		});

		const lane: LaneDecoder = { clipId, generation, decoder };
		this.lanes.set(role, lane);
		this.coordinator.activate(role, clipId, generation, {
			get decodeQueueSize() {
				return decoder.decodeQueueSize;
			},
			close: () => decoder.close()
		});
		return lane;
	}

	private assertOpen() {
		if (this.disposed) throw new Error('decode-scheduler-disposed');
	}
}
