import type { DeckFrameHandleRef, HotDeckReadiness, HotDeckState } from '$lib/engine/contracts';

export type HotDeckId = string;
export type DecodeBackend = 'webcodecs' | 'htmlvideo' | 'native_ffmpeg';
export type RendererBackend = 'webgpu' | 'webgl2' | 'htmlvideo';

export type HotDeckTelemetryEvent =
	| 'hotDeck.prepare.start'
	| 'hotDeck.prepare.ready'
	| 'hotDeck.prepare.failed'
	| 'hotDeck.switch.requested'
	| 'hotDeck.switch.presented'
	| 'hotDeck.switch.fallbackCold';

export type HotDeckEvent =
	| { type: 'prepare'; slotId: string; sourceId: string }
	| { type: 'resourcesReady' }
	| { type: 'frameReady'; frame: DeckFrameHandleRef }
	| { type: 'prepareFailed'; error: string; fallbackReason?: string | null }
	| { type: 'dispose' }
	| { type: 'retry' };

export interface HotDeckLifecycleOptions {
	id: HotDeckId;
	slotId?: string;
	sourceId?: string;
	rendererBackend?: RendererBackend;
	decodeBackend?: DecodeBackend;
	now?: () => number;
	onTelemetry?: (event: HotDeckTelemetryEvent, payload: Record<string, unknown>) => void;
	onReleaseFrame?: (frame: DeckFrameHandleRef) => void;
}

export class HotDeckTransitionError extends Error {
	constructor(
		message: string,
		public readonly from: HotDeckReadiness,
		public readonly event: HotDeckEvent['type']
	) {
		super(message);
		this.name = 'HotDeckTransitionError';
	}
}

function isValidFrameHandle(frame: DeckFrameHandleRef | null): frame is DeckFrameHandleRef {
	return (
		frame !== null &&
		frame.id.length > 0 &&
		frame.sourceId.length > 0 &&
		frame.deckId.length > 0 &&
		Number.isFinite(frame.sourceTimeMs) &&
		Number.isFinite(frame.createdAtMs)
	);
}

export class HotDeckLifecycle {
	private slotId: string;
	private sourceId: string;
	private readiness: HotDeckReadiness = 'cold';
	private preparedFrame: DeckFrameHandleRef | null = null;
	private lastError: string | null = null;
	private updatedAtMs: number;
	private readonly rendererBackend: RendererBackend;
	private readonly decodeBackend: DecodeBackend;

	constructor(private readonly options: HotDeckLifecycleOptions) {
		this.slotId = options.slotId ?? '';
		this.sourceId = options.sourceId ?? '';
		this.rendererBackend = options.rendererBackend ?? 'webgpu';
		this.decodeBackend = options.decodeBackend ?? 'webcodecs';
		this.updatedAtMs = (options.now ?? Date.now)();
	}

	get id() {
		return this.options.id;
	}

	get state(): HotDeckState {
		return {
			id: this.options.id,
			slotId: this.slotId,
			sourceId: this.sourceId,
			readiness: this.readiness,
			preparedFrame: this.preparedFrame,
			lastError: this.lastError,
			updatedAtMs: this.updatedAtMs
		};
	}

	dispatch(event: HotDeckEvent): HotDeckState {
		const from = this.readiness;
		switch (event.type) {
			case 'prepare':
				this.transition(from, 'warming', event, () => {
					if (!event.slotId.trim() || !event.sourceId.trim()) {
						throw new HotDeckTransitionError(
							'hot-deck-prepare-invalid-identifiers',
							from,
							event.type
						);
					}
					this.releasePreparedFrame();
					this.slotId = event.slotId;
					this.sourceId = event.sourceId;
					this.lastError = null;
					this.emit('hotDeck.prepare.start', {
						deckId: this.options.id,
						slotId: this.slotId,
						sourceId: this.sourceId
					});
				});
				break;
			case 'resourcesReady':
				this.transition(from, 'warm', event, () => {
					if (from !== 'warming') {
						throw new HotDeckTransitionError('hot-deck-resources-not-warming', from, event.type);
					}
				});
				break;
			case 'frameReady':
				this.transition(from, 'hot', event, () => {
					if (from !== 'warming' && from !== 'warm') {
						throw new HotDeckTransitionError('hot-deck-frame-not-prepared', from, event.type);
					}
					if (!isValidFrameHandle(event.frame)) {
						throw new HotDeckTransitionError('hot-deck-frame-invalid', from, event.type);
					}
					if (event.frame.deckId !== this.options.id) {
						throw new HotDeckTransitionError('hot-deck-frame-deck-mismatch', from, event.type);
					}
					this.releasePreparedFrame();
					this.preparedFrame = { ...event.frame };
					this.lastError = null;
					this.emit('hotDeck.prepare.ready', {
						deckId: this.options.id,
						preparedFrameId: event.frame.id,
						readiness: 'hot'
					});
				});
				break;
			case 'prepareFailed':
				this.transition(from, 'failed', event, () => {
					if (from !== 'warming' && from !== 'warm') {
						throw new HotDeckTransitionError('hot-deck-failure-not-preparing', from, event.type);
					}
					this.releasePreparedFrame();
					this.lastError = event.error;
					this.emit('hotDeck.prepare.failed', {
						deckId: this.options.id,
						error: event.error,
						fallbackReason: event.fallbackReason ?? null
					});
				});
				break;
			case 'dispose':
				this.transition(from, 'disposed', event, () => {
					if (from === 'disposed') return;
					this.releasePreparedFrame();
				});
				break;
			case 'retry':
				this.transition(from, 'warming', event, () => {
					if (from !== 'failed' && from !== 'disposed') {
						throw new HotDeckTransitionError('hot-deck-retry-not-recoverable', from, event.type);
					}
					this.releasePreparedFrame();
					this.lastError = null;
					if (!this.slotId.trim() || !this.sourceId.trim()) {
						throw new HotDeckTransitionError(
							'hot-deck-retry-missing-identifiers',
							from,
							event.type
						);
					}
					this.emit('hotDeck.prepare.start', {
						deckId: this.options.id,
						slotId: this.slotId,
						sourceId: this.sourceId,
						retry: true
					});
				});
				break;
			default: {
				const exhaustive: never = event;
				throw new HotDeckTransitionError(`hot-deck-unknown-event:${String(exhaustive)}`, from, 'prepare');
			}
		}

		this.updatedAtMs = (this.options.now ?? Date.now)();
		return this.state;
	}

	canTransition(eventType: HotDeckEvent['type']): boolean {
		const from = this.readiness;
		switch (eventType) {
			case 'prepare':
				return from === 'cold';
			case 'resourcesReady':
				return from === 'warming';
			case 'frameReady':
				return from === 'warming' || from === 'warm';
			case 'prepareFailed':
				return from === 'warming' || from === 'warm';
			case 'dispose':
				return from !== 'disposed';
			case 'retry':
				return from === 'failed' || from === 'disposed';
			default:
				return false;
		}
	}

	private transition(
		from: HotDeckReadiness,
		to: HotDeckReadiness,
		event: HotDeckEvent,
		apply: () => void
	) {
		this.assertTransition(from, event);
		apply();
		this.readiness = to;
	}

	private assertTransition(from: HotDeckReadiness, event: HotDeckEvent) {
		switch (event.type) {
			case 'prepare':
				if (from !== 'cold') {
					throw new HotDeckTransitionError('hot-deck-prepare-not-cold', from, event.type);
				}
				break;
			case 'resourcesReady':
				if (from !== 'warming') {
					throw new HotDeckTransitionError('hot-deck-resources-not-warming', from, event.type);
				}
				break;
			case 'frameReady':
				if (from !== 'warming' && from !== 'warm') {
					throw new HotDeckTransitionError('hot-deck-frame-not-prepared', from, event.type);
				}
				if (!isValidFrameHandle(event.frame)) {
					throw new HotDeckTransitionError('hot-deck-frame-invalid', from, event.type);
				}
				break;
			case 'prepareFailed':
				if (from !== 'warming' && from !== 'warm') {
					throw new HotDeckTransitionError('hot-deck-failure-not-preparing', from, event.type);
				}
				break;
			case 'dispose':
				if (from === 'disposed') {
					throw new HotDeckTransitionError('hot-deck-already-disposed', from, event.type);
				}
				break;
			case 'retry':
				if (from !== 'failed' && from !== 'disposed') {
					throw new HotDeckTransitionError('hot-deck-retry-not-recoverable', from, event.type);
				}
				break;
		}
	}

	private releasePreparedFrame() {
		if (!this.preparedFrame) return;
		this.options.onReleaseFrame?.(this.preparedFrame);
		this.preparedFrame = null;
	}

	private emit(event: HotDeckTelemetryEvent, payload: Record<string, unknown>) {
		this.options.onTelemetry?.(event, payload);
	}
}

export interface VisibleDeckSelection {
	mode: 'steady' | 'transition';
	decks: HotDeckId[];
}

export function selectVisibleDecks(
	activeDeckId: HotDeckId | null,
	incomingDeckId: HotDeckId | null,
	transitionActive: boolean
): VisibleDeckSelection {
	if (transitionActive) {
		if (!activeDeckId || !incomingDeckId) {
			throw new Error('transition-requires-two-decks');
		}
		if (activeDeckId === incomingDeckId) {
			throw new Error('transition-deck-alias');
		}
		return { mode: 'transition', decks: [activeDeckId, incomingDeckId] };
	}
	if (!activeDeckId) {
		throw new Error('steady-state-requires-active-deck');
	}
	return { mode: 'steady', decks: [activeDeckId] };
}

export function markDeckHot(deck: HotDeckState, frame: DeckFrameHandleRef): HotDeckState {
	return {
		...deck,
		readiness: 'hot',
		preparedFrame: frame,
		lastError: null,
		updatedAtMs: Date.now()
	};
}

export class HotDeckManager {
	private decks = new Map<string, HotDeckLifecycle>();

	upsert(id: string, slotId: string, sourceId: string): HotDeckState {
		let lifecycle = this.decks.get(id);
		if (!lifecycle) {
			lifecycle = new HotDeckLifecycle({ id, slotId, sourceId });
			this.decks.set(id, lifecycle);
			if (lifecycle.canTransition('prepare')) {
				lifecycle.dispatch({ type: 'prepare', slotId, sourceId });
			}
		}
		return lifecycle.state;
	}

	get(id: string): HotDeckState | undefined {
		return this.decks.get(id)?.state;
	}

	lifecycle(id: string): HotDeckLifecycle | undefined {
		return this.decks.get(id);
	}

	update(id: string, next: HotDeckState) {
		const lifecycle = this.decks.get(id);
		if (!lifecycle) return;
		if (next.preparedFrame && next.readiness === 'hot') {
			if (lifecycle.canTransition('frameReady')) {
				lifecycle.dispatch({ type: 'frameReady', frame: next.preparedFrame });
			}
		}
	}

	dispose(id: string) {
		const lifecycle = this.decks.get(id);
		if (lifecycle?.canTransition('dispose')) {
			lifecycle.dispatch({ type: 'dispose' });
		}
		this.decks.delete(id);
	}

	snapshot(): HotDeckState[] {
		return [...this.decks.values()].map((d) => d.state);
	}
}

export const hotDeckManager = new HotDeckManager();
