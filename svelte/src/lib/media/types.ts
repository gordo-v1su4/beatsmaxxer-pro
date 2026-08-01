export type AvcProfile = 'baseline' | 'main' | 'high';
export type ChromaSubsampling = '4:2:0' | '4:2:2' | '4:4:4';

export interface VideoDecoderConfigLike {
	codec: string;
	codedWidth: number;
	codedHeight: number;
	description?: AllowSharedBufferSource;
}

export interface VideoTrackMetadata {
	container: string;
	codec: string;
	profile: string;
	bitDepth: number;
	chromaSubsampling: ChromaSubsampling | string;
	codedWidth: number;
	codedHeight: number;
	frameRate: number;
	decodeOrder: 'dts-proven' | string;
}

export interface EncodedVideoSample {
	index: number;
	decodeTimestampUs: number;
	timestampUs: number;
	durationUs: number;
	type: 'key' | 'delta';
	data: Uint8Array;
}

export interface DemuxedVideoTrack {
	metadata: VideoTrackMetadata;
	decoderConfig: VideoDecoderConfigLike;
	samples: readonly EncodedVideoSample[];
}

export interface DecodedFrameLike {
	readonly timestamp: number;
	readonly duration?: number | null;
	close(): void;
	clone?(): DecodedFrameLike;
}

export interface ClipAsset {
	readonly id: string;
	readonly durationUs: number;
	readonly startTimestampUs: number;
	readonly metadata: Readonly<VideoTrackMetadata>;
	readonly decoderConfig: Readonly<VideoDecoderConfigLike>;
	readonly samples: readonly EncodedVideoSample[];
	readonly keyframeSampleIndexes: readonly number[];
}
