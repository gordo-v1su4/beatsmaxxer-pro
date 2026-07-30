import type { DecodedFrameLike } from '$lib/media/types';

export interface FrameIdentity {
	clipId: string;
	generation: number;
	timestampUs: number;
}

interface FrameEntry<Frame extends DecodedFrameLike> extends FrameIdentity {
	frame: Frame;
	durationUs: number;
	leases: number;
	lastAccess: number;
	pendingClose: boolean;
}

interface LeaseToken<Frame extends DecodedFrameLike> {
	frame: Frame;
	released: boolean;
	release(): void;
}

export interface FrameLeaseObserver<Frame extends DecodedFrameLike> {
	onTransfer?(previous: FrameLease<Frame>, next: FrameLease<Frame>): void;
	onRelease?(lease: FrameLease<Frame>): void;
}

export interface FrameCacheMetrics {
	occupancy: number;
	capacity: number;
}

export interface FrameCacheOptions<Frame extends DecodedFrameLike> {
	onClose?: (frame: Frame) => void;
	onMetrics?: (metrics: FrameCacheMetrics) => void;
}

export class DetachedFrameLease<Frame extends DecodedFrameLike> {
	private released = false;

	constructor(
		public readonly owner: string,
		public readonly frame: Frame
	) {}

	get valid() {
		return !this.released;
	}

	release() {
		if (this.released) return;
		this.released = true;
		this.frame.close();
	}
}

export class FrameLease<Frame extends DecodedFrameLike> {
	private ownsToken = true;

	constructor(
		private readonly token: LeaseToken<Frame>,
		public readonly owner: string,
		private readonly observer?: FrameLeaseObserver<Frame>
	) {}

	get frame() {
		if (!this.valid) throw new Error('frame-lease-released');
		return this.token.frame;
	}

	get valid() {
		return this.ownsToken && !this.token.released;
	}

	transfer(owner: string): FrameLease<Frame> {
		if (!this.valid) throw new Error('frame-lease-released');
		const next = new FrameLease(this.token, owner, this.observer);
		this.ownsToken = false;
		this.observer?.onTransfer?.(this, next);
		return next;
	}

	clone(owner: string): DetachedFrameLease<Frame> {
		if (!this.valid) throw new Error('frame-lease-released');
		if (!this.token.frame.clone) throw new Error('frame-clone-unsupported');
		return new DetachedFrameLease(owner, this.token.frame.clone() as Frame);
	}

	release() {
		if (!this.ownsToken) return;
		this.ownsToken = false;
		this.token.release();
		this.observer?.onRelease?.(this);
	}
}

export class PresentationReceipt<Frame extends DecodedFrameLike> {
	private released = false;

	private constructor(private readonly lease: FrameLease<Frame>) {}

	static submitted<Frame extends DecodedFrameLike>(lease: FrameLease<Frame>) {
		if (!lease.valid) throw new Error('frame-lease-released');
		return new PresentationReceipt(lease);
	}

	release() {
		if (this.released) return;
		this.released = true;
		this.lease.release();
	}
}

function frameKey(identity: FrameIdentity) {
	return `${identity.clipId}\u0000${identity.generation}\u0000${identity.timestampUs}`;
}

export class FrameCache<Frame extends DecodedFrameLike> {
	private readonly entries = new Map<string, FrameEntry<Frame>>();
	private readonly closedFrames = new WeakSet<object>();
	private accessCounter = 0;
	private disposed = false;

	constructor(
		public readonly capacity: number,
		private readonly options: FrameCacheOptions<Frame> = {}
	) {
		if (!Number.isInteger(capacity) || capacity <= 0) {
			throw new Error('invalid-frame-cache-capacity');
		}
	}

	get size() {
		return this.entries.size;
	}

	insert(identity: FrameIdentity, frame: Frame, durationUs = frame.duration ?? 0) {
		if (this.disposed) {
			this.closeFrame(frame);
			return false;
		}
		const key = frameKey(identity);
		const existing = this.entries.get(key);
		if (existing) {
			if (existing.frame !== frame) this.closeFrame(frame);
			return false;
		}

		while (this.entries.size >= this.capacity) {
			if (!this.evictLeastRecentlyUsed()) {
				this.closeFrame(frame);
				return false;
			}
		}

		this.entries.set(key, {
			...identity,
			frame,
			durationUs: Math.max(0, durationUs),
			leases: 0,
			lastAccess: ++this.accessCounter,
			pendingClose: false
		});
		this.reportMetrics();
		return true;
	}

	acquire(
		identity: FrameIdentity,
		owner: string,
		observer?: FrameLeaseObserver<Frame>
	): FrameLease<Frame> | null {
		const entry = this.entries.get(frameKey(identity));
		return entry ? this.leaseEntry(entry, owner, observer) : null;
	}

	acquireForTimestamp(
		clipId: string,
		generation: number,
		timestampUs: number,
		owner: string,
		observer?: FrameLeaseObserver<Frame>
	): FrameLease<Frame> | null {
		let selected: FrameEntry<Frame> | null = null;
		for (const entry of this.entries.values()) {
			if (
				entry.clipId !== clipId ||
				entry.generation !== generation ||
				entry.timestampUs > timestampUs
			) {
				continue;
			}
			if (selected === null || entry.timestampUs > selected.timestampUs) {
				selected = entry;
			}
			if (
				entry.durationUs > 0 &&
				timestampUs < entry.timestampUs + entry.durationUs
			) {
				selected = entry;
				break;
			}
		}
		return selected ? this.leaseEntry(selected, owner, observer) : null;
	}

	clearGeneration(clipId: string, generation: number) {
		this.removeMatching((entry) => entry.clipId === clipId && entry.generation === generation);
	}

	clear() {
		this.removeMatching(() => true);
	}

	evictUnleased(count = Number.POSITIVE_INFINITY) {
		let evicted = 0;
		while (evicted < count && this.evictLeastRecentlyUsed()) {
			evicted += 1;
		}
		return evicted;
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.clear();
	}

	private leaseEntry(
		entry: FrameEntry<Frame>,
		owner: string,
		observer?: FrameLeaseObserver<Frame>
	) {
		if (this.disposed || entry.pendingClose) return null;
		entry.leases += 1;
		entry.lastAccess = ++this.accessCounter;
		const token: LeaseToken<Frame> = {
			frame: entry.frame,
			released: false,
			release: () => {
				if (token.released) return;
				token.released = true;
				entry.leases = Math.max(0, entry.leases - 1);
				if (entry.pendingClose && entry.leases === 0) {
					this.entries.delete(frameKey(entry));
					this.closeFrame(entry.frame);
					this.reportMetrics();
				}
			}
		};
		return new FrameLease(token, owner, observer);
	}

	private evictLeastRecentlyUsed() {
		let selected: FrameEntry<Frame> | null = null;
		for (const entry of this.entries.values()) {
			if (
				entry.leases === 0 &&
				!entry.pendingClose &&
				(selected === null || entry.lastAccess < selected.lastAccess)
			) {
				selected = entry;
			}
		}
		if (selected === null) return false;
		this.entries.delete(frameKey(selected));
		this.closeFrame(selected.frame);
		this.reportMetrics();
		return true;
	}

	private removeMatching(predicate: (entry: FrameEntry<Frame>) => boolean) {
		for (const [key, entry] of this.entries) {
			if (!predicate(entry)) continue;
			if (entry.leases > 0) {
				entry.pendingClose = true;
			} else {
				this.entries.delete(key);
				this.closeFrame(entry.frame);
			}
		}
		this.reportMetrics();
	}

	private closeFrame(frame: Frame) {
		if (this.closedFrames.has(frame)) return;
		this.closedFrames.add(frame);
		frame.close();
		this.options.onClose?.(frame);
	}

	private reportMetrics() {
		this.options.onMetrics?.({
			occupancy: this.entries.size,
			capacity: this.capacity
		});
	}
}
