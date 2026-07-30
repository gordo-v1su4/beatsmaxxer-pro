import {
	FrameCache,
	type FrameIdentity,
	type FrameLease,
	type FrameLeaseObserver
} from '$lib/media/FrameCache';
import type { DecodedFrameLike, MediaFallback } from '$lib/media/types';

export const PLAYBACK_LANE_ROLES = ['pgm', 'prewarm', 'overlap'] as const;
export type PlaybackLaneRole = (typeof PLAYBACK_LANE_ROLES)[number];

export const MAX_FRAMES_PER_LANE = 12;
export const MAX_GLOBAL_FRAMES = 32;
export const MAX_DECODE_QUEUE_SIZE = 8;

export interface LaneDecoderResource {
	readonly decodeQueueSize: number;
	close(): void;
}

export interface PlaybackLane<Frame extends DecodedFrameLike> {
	readonly role: PlaybackLaneRole;
	readonly clipId: string;
	generation: number;
	readonly cache: FrameCache<Frame>;
	decoder: LaneDecoderResource | null;
	decodeBatchActive: boolean;
}

export interface PlaybackTransportState {
	presentationTimeSeconds: number;
	playing: boolean;
	discontinuityGeneration: number;
}

export type PressureAction =
	| 'inactive-cache-evicted'
	| 'prewarm-frames-dropped'
	| 'prewarm-decoder-closed'
	| 'overlap-disabled'
	| 'html-fallback-selected';

export interface PlaybackCoordinatorSnapshot {
	slots: Record<
		PlaybackLaneRole,
		{
			clipId: string;
			generation: number;
			retainedFrames: number;
			decoderOpen: boolean;
			decodeQueueSize: number;
		} | null
	>;
	retainedFrames: number;
	activeLeases: number;
	activeDecoders: number;
	overlapEnabled: boolean;
	fallback: MediaFallback;
	rendererResourceGeneration: number;
	transport: PlaybackTransportState;
	pressure: {
		stage: number;
		count: number;
		lastAction: PressureAction | null;
	};
}

export interface PlaybackCoordinatorOptions {
	onTelemetry?: (snapshot: PlaybackCoordinatorSnapshot) => void;
	initialPlayback?: MediaFallback;
}

function isLaneRole(value: string): value is PlaybackLaneRole {
	return (PLAYBACK_LANE_ROLES as readonly string[]).includes(value);
}

export class PlaybackCoordinator<Frame extends DecodedFrameLike> {
	private readonly slots: Record<PlaybackLaneRole, PlaybackLane<Frame> | null> = {
		pgm: null,
		prewarm: null,
		overlap: null
	};
	private readonly inactiveCache: FrameCache<Frame>;
	private readonly frameOwners = new WeakMap<object, PlaybackLaneRole | 'inactive'>();
	private readonly leases = new Map<FrameLease<Frame>, PlaybackLaneRole>();
	private readonly leaseObserver: FrameLeaseObserver<Frame> = {
		onTransfer: (previous, next) => {
			const role = this.leases.get(previous);
			if (!role) return;
			this.leases.delete(previous);
			this.leases.set(next, role);
			this.report();
		},
		onRelease: (lease) => {
			if (this.leases.delete(lease)) this.report();
		}
	};
	private pressureStage = 0;
	private pressureCount = 0;
	private lastPressureAction: PressureAction | null = null;
	private disposed = false;
	private overlapEnabled = true;
	private rendererResourceGeneration = 0;
	private fallback: MediaFallback = {
		path: 'native-static',
		reason: 'media-core-not-selected'
	};
	private transport: PlaybackTransportState = {
		presentationTimeSeconds: 0,
		playing: false,
		discontinuityGeneration: 0
	};

	constructor(private readonly options: PlaybackCoordinatorOptions = {}) {
		this.inactiveCache = new FrameCache<Frame>(MAX_FRAMES_PER_LANE, {
			onClose: (frame) => {
				if (this.frameOwners.get(frame) === 'inactive') {
					this.frameOwners.delete(frame);
				}
			},
			onMetrics: () => this.report()
		});
		if (options.initialPlayback) {
			this.fallback = { ...options.initialPlayback };
		}
	}

	activate(
		role: PlaybackLaneRole,
		clipId: string,
		generation: number,
		decoder: LaneDecoderResource | null
	) {
		this.assertOpen();
		if (!isLaneRole(role)) throw new Error('fourth-playback-lane-prohibited');
		if (role === 'overlap' && !this.overlapEnabled) {
			throw new Error('overlap-disabled');
		}
		if (clipId.length === 0) throw new Error('clip-id-required');
		if (!Number.isInteger(generation) || generation < 0) {
			throw new Error('invalid-lane-generation');
		}
		if (decoder && decoder.decodeQueueSize > MAX_DECODE_QUEUE_SIZE) {
			throw new Error('decode-queue-budget-exceeded');
		}
		if (
			PLAYBACK_LANE_ROLES.some(
				(existingRole) => decoder !== null && this.slots[existingRole]?.decoder === decoder
			)
		) {
			throw new Error('decoder-owner-alias');
		}
		this.releaseLeases(role);
		this.releaseLane(this.slots[role]);
		this.slots[role] = {
			role,
			clipId,
			generation,
			cache: new FrameCache<Frame>(MAX_FRAMES_PER_LANE, {
				onClose: (frame) => {
					if (this.frameOwners.get(frame) === role) {
						this.frameOwners.delete(frame);
					}
				},
				onMetrics: () => this.report()
			}),
			decoder,
			decodeBatchActive: false
		};
		this.enforceBudgets();
		this.report();
		return this.slots[role];
	}

	deactivate(role: PlaybackLaneRole) {
		this.assertRole(role);
		this.releaseLeases(role);
		this.releaseLane(this.slots[role]);
		this.slots[role] = null;
		this.report();
	}

	getLane(role: PlaybackLaneRole) {
		this.assertRole(role);
		return this.slots[role];
	}

	setLaneGeneration(role: PlaybackLaneRole, generation: number) {
		const lane = this.requireLane(role);
		if (!Number.isInteger(generation) || generation < lane.generation) {
			throw new Error('invalid-lane-generation');
		}
		if (generation === lane.generation) return;
		this.releaseLeases(role);
		lane.cache.clear();
		lane.generation = generation;
		this.report();
	}

	insertFrame(
		role: PlaybackLaneRole,
		identity: FrameIdentity,
		frame: Frame,
		durationUs = frame.duration ?? 0
	) {
		const lane = this.requireLane(role);
		if (this.frameOwners.has(frame)) {
			throw new Error('frame-owner-alias');
		}
		if (identity.clipId !== lane.clipId || identity.generation !== lane.generation) {
			frame.close();
			return false;
		}
		const inserted = lane.cache.insert(identity, frame, durationUs);
		if (inserted) this.frameOwners.set(frame, role);
		this.enforceBudgets();
		this.report();
		return inserted;
	}

	leaseFrame(role: PlaybackLaneRole, timestampUs: number, owner: string) {
		const lane = this.requireLane(role);
		const lease = lane.cache.acquireForTimestamp(
			lane.clipId,
			lane.generation,
			timestampUs,
			owner,
			this.leaseObserver
		);
		if (lease) this.leases.set(lease, role);
		return lease;
	}

	leaseCrossfade(
		timestampUs: number,
		pgmOwner = 'compositor-pgm',
		overlapOwner = 'compositor-overlap'
	): {
		pgm: FrameLease<Frame>;
		overlap: FrameLease<Frame>;
	} | null {
		const pgm = this.leaseFrame('pgm', timestampUs, pgmOwner);
		const overlap = this.leaseFrame('overlap', timestampUs, overlapOwner);
		if (!pgm || !overlap) {
			pgm?.release();
			overlap?.release();
			return null;
		}
		if (pgm.frame === overlap.frame) {
			pgm.release();
			overlap.release();
			throw new Error('crossfade-frame-alias');
		}
		return { pgm, overlap };
	}

	beginDecodeBatch(role: PlaybackLaneRole) {
		const lane = this.requireLane(role);
		if (!this.observeDecoderQueue(role)) {
			throw new Error('decode-queue-budget-exceeded');
		}
		if (lane.decodeBatchActive) {
			throw new Error('decode-batch-already-active');
		}
		lane.decodeBatchActive = true;
		let ended = false;
		this.report();
		return () => {
			if (ended) return;
			ended = true;
			lane.decodeBatchActive = false;
			this.report();
		};
	}

	retainInactiveFrame(identity: FrameIdentity, frame: Frame, durationUs = frame.duration ?? 0) {
		this.assertOpen();
		if (this.frameOwners.has(frame)) {
			throw new Error('frame-owner-alias');
		}
		const inserted = this.inactiveCache.insert(identity, frame, durationUs);
		if (inserted) this.frameOwners.set(frame, 'inactive');
		this.enforceBudgets();
		this.report();
		return inserted;
	}

	observeDecoderQueue(
		role: PlaybackLaneRole,
		queueSize = this.requireLane(role).decoder?.decodeQueueSize ?? 0
	) {
		const lane = this.requireLane(role);
		if (queueSize <= MAX_DECODE_QUEUE_SIZE) {
			this.report();
			return true;
		}
		lane.decoder?.close();
		lane.decoder = null;
		lane.decodeBatchActive = false;
		this.fallback = {
			path: 'html-video-webgl2',
			reason: 'decode-queue-budget-exceeded'
		};
		this.report();
		return false;
	}

	updateTransport(transport: PlaybackTransportState) {
		this.transport = { ...transport };
		this.report();
	}

	selectPlaybackPath(fallback: MediaFallback) {
		this.assertOpen();
		this.fallback = { ...fallback };
		this.report();
	}

	handleRendererLoss(recovered: boolean) {
		this.assertOpen();
		if (recovered) {
			this.rendererResourceGeneration += 1;
		} else {
			this.releaseAllLeases();
			for (const role of PLAYBACK_LANE_ROLES) {
				this.releaseLane(this.slots[role]);
				this.slots[role] = null;
			}
			this.inactiveCache.clear();
			this.fallback = {
				path: 'html-video-webgl2',
				reason: 'renderer-device-lost'
			};
		}
		this.report();
	}

	degradeForPressure(): PressureAction {
		this.assertOpen();
		const action: PressureAction =
			this.pressureStage === 0
				? this.evictInactive()
				: this.pressureStage === 1
					? this.dropPrewarmFrames()
					: this.pressureStage === 2
						? this.closePrewarmDecoder()
						: this.pressureStage === 3
							? this.disableOverlap()
							: this.selectPressureFallback();
		this.pressureStage = Math.min(5, this.pressureStage + 1);
		this.pressureCount += 1;
		this.lastPressureAction = action;
		this.report();
		return action;
	}

	snapshot(): PlaybackCoordinatorSnapshot {
		const slot = (role: PlaybackLaneRole) => {
			const lane = this.slots[role];
			return lane
				? {
						clipId: lane.clipId,
						generation: lane.generation,
						retainedFrames: lane.cache.size,
						decoderOpen: lane.decoder !== null,
						decodeQueueSize: lane.decoder?.decodeQueueSize ?? 0
					}
				: null;
		};
		return {
			slots: {
				pgm: slot('pgm'),
				prewarm: slot('prewarm'),
				overlap: slot('overlap')
			},
			retainedFrames: this.totalRetainedFrames(),
			activeLeases: this.leases.size,
			activeDecoders: PLAYBACK_LANE_ROLES.filter((role) => this.slots[role]?.decoder).length,
			overlapEnabled: this.overlapEnabled,
			fallback: { ...this.fallback },
			rendererResourceGeneration: this.rendererResourceGeneration,
			transport: { ...this.transport },
			pressure: {
				stage: this.pressureStage,
				count: this.pressureCount,
				lastAction: this.lastPressureAction
			}
		};
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.releaseAllLeases();
		for (const role of PLAYBACK_LANE_ROLES) {
			this.releaseLane(this.slots[role]);
			this.slots[role] = null;
		}
		this.inactiveCache.dispose();
		this.report();
	}

	private enforceBudgets() {
		for (const role of PLAYBACK_LANE_ROLES) {
			const lane = this.slots[role];
			if (lane?.decoder && lane.decoder.decodeQueueSize > MAX_DECODE_QUEUE_SIZE) {
				throw new Error('decode-queue-budget-exceeded');
			}
		}
		let overflow = this.totalRetainedFrames() - MAX_GLOBAL_FRAMES;
		if (overflow > 0) {
			overflow -= this.inactiveCache.evictUnleased(overflow);
		}
		for (const role of ['prewarm', 'overlap', 'pgm'] as const) {
			if (overflow <= 0) break;
			overflow -= this.slots[role]?.cache.evictUnleased(overflow) ?? 0;
		}
		if (this.totalRetainedFrames() > MAX_GLOBAL_FRAMES) {
			throw new Error('global-frame-budget-exceeded');
		}
	}

	private totalRetainedFrames() {
		return (
			this.inactiveCache.size +
			PLAYBACK_LANE_ROLES.reduce((total, role) => total + (this.slots[role]?.cache.size ?? 0), 0)
		);
	}

	private evictInactive(): PressureAction {
		this.inactiveCache.clear();
		return 'inactive-cache-evicted';
	}

	private dropPrewarmFrames(): PressureAction {
		this.slots.prewarm?.cache.clear();
		return 'prewarm-frames-dropped';
	}

	private closePrewarmDecoder(): PressureAction {
		this.slots.prewarm?.decoder?.close();
		if (this.slots.prewarm) this.slots.prewarm.decoder = null;
		return 'prewarm-decoder-closed';
	}

	private disableOverlap(): PressureAction {
		this.releaseLeases('overlap');
		this.releaseLane(this.slots.overlap);
		this.slots.overlap = null;
		this.overlapEnabled = false;
		return 'overlap-disabled';
	}

	private selectPressureFallback(): PressureAction {
		this.releaseLeases('pgm');
		this.releaseLane(this.slots.pgm);
		this.slots.pgm = null;
		this.fallback = {
			path: 'html-video-webgl2',
			reason: 'decoded-frame-pressure'
		};
		return 'html-fallback-selected';
	}

	private releaseLane(lane: PlaybackLane<Frame> | null) {
		if (!lane) return;
		lane.decoder?.close();
		lane.decoder = null;
		lane.cache.dispose();
		lane.decodeBatchActive = false;
	}

	private releaseLeases(role: PlaybackLaneRole) {
		for (const [lease, leaseRole] of this.leases) {
			if (leaseRole !== role) continue;
			lease.release();
			this.leases.delete(lease);
		}
	}

	private releaseAllLeases() {
		for (const lease of this.leases.keys()) lease.release();
		this.leases.clear();
	}

	private requireLane(role: PlaybackLaneRole) {
		this.assertRole(role);
		const lane = this.slots[role];
		if (!lane) throw new Error('playback-lane-inactive');
		return lane;
	}

	private assertRole(role: PlaybackLaneRole) {
		if (!isLaneRole(role)) throw new Error('fourth-playback-lane-prohibited');
	}

	private assertOpen() {
		if (this.disposed) throw new Error('playback-coordinator-disposed');
	}

	private report() {
		this.options.onTelemetry?.(this.snapshot());
	}
}
