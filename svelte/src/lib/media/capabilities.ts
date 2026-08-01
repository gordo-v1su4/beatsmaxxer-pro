import type { VideoDecoderConfigLike, VideoTrackMetadata } from '$lib/media/types';

export type DirectPlaybackUnsupportedReason =
	| 'insecure-context'
	| 'webcodecs-unavailable'
	| 'unsupported-container'
	| 'unsupported-codec'
	| 'unsupported-profile'
	| 'unsupported-bit-depth'
	| 'unsupported-chroma-subsampling'
	| 'resolution-exceeds-1080p'
	| 'frame-rate-exceeds-60'
	| 'unproven-decode-order'
	| 'decoder-config-mismatch'
	| 'decoder-config-unsupported'
	| 'decoder-probe-failed'
	| 'sample-frame-probe-failed';

export type DirectPlaybackProbe =
	| {
			supported: true;
			reason: null;
			config: VideoDecoderConfigLike;
	  }
	| {
			supported: false;
			reason: DirectPlaybackUnsupportedReason;
			config: VideoDecoderConfigLike;
	  };

export interface VideoDecoderSupportProbe {
	isConfigSupported(config: VideoDecoderConfigLike): Promise<{ supported?: boolean }>;
}

export interface PlaybackCapabilityEnvironment {
	secureContext: boolean;
	videoDecoder: VideoDecoderSupportProbe | null;
	sampleFrameProbe: ((config: VideoDecoderConfigLike) => Promise<boolean>) | null;
}

const AVC_CODEC = /^(avc1|avc3)\.([0-9a-f]{2})([0-9a-f]{4})$/i;
const PROFILE_BY_IDC: Readonly<Record<string, string>> = {
	'42': 'baseline',
	'4d': 'main',
	'64': 'high'
};

function staticUnsupportedReason(
	metadata: VideoTrackMetadata,
	config: VideoDecoderConfigLike
): DirectPlaybackUnsupportedReason | null {
	if (metadata.container.toLowerCase() !== 'mp4') {
		return 'unsupported-container';
	}
	const codecMatch = AVC_CODEC.exec(metadata.codec);
	if (!codecMatch) return 'unsupported-codec';
	const profile = metadata.profile.toLowerCase();
	if (!['baseline', 'main', 'high'].includes(profile)) {
		return 'unsupported-profile';
	}
	if (PROFILE_BY_IDC[codecMatch[2].toLowerCase()] !== profile) {
		return 'unsupported-profile';
	}
	if (metadata.bitDepth !== 8) return 'unsupported-bit-depth';
	if (metadata.chromaSubsampling !== '4:2:0') {
		return 'unsupported-chroma-subsampling';
	}
	if (
		!Number.isFinite(metadata.codedWidth) ||
		!Number.isFinite(metadata.codedHeight) ||
		!Number.isInteger(metadata.codedWidth) ||
		!Number.isInteger(metadata.codedHeight) ||
		metadata.codedWidth <= 0 ||
		metadata.codedHeight <= 0 ||
		metadata.codedWidth > 1920 ||
		metadata.codedHeight > 1080
	) {
		return 'resolution-exceeds-1080p';
	}
	if (
		!Number.isFinite(metadata.frameRate) ||
		metadata.frameRate <= 0 ||
		metadata.frameRate > 60
	) {
		return 'frame-rate-exceeds-60';
	}
	if (metadata.decodeOrder !== 'dts-proven') {
		return 'unproven-decode-order';
	}
	if (
		config.codec.toLowerCase() !== metadata.codec.toLowerCase() ||
		config.codedWidth !== metadata.codedWidth ||
		config.codedHeight !== metadata.codedHeight
	) {
		return 'decoder-config-mismatch';
	}
	return null;
}

export async function probeDirectPlayback(
	metadata: VideoTrackMetadata,
	config: VideoDecoderConfigLike,
	environment: PlaybackCapabilityEnvironment
): Promise<DirectPlaybackProbe> {
	if (!environment.secureContext) {
		return { supported: false, reason: 'insecure-context', config };
	}
	if (environment.videoDecoder === null) {
		return { supported: false, reason: 'webcodecs-unavailable', config };
	}
	const unsupported = staticUnsupportedReason(metadata, config);
	if (unsupported) return { supported: false, reason: unsupported, config };

	let decoderSupported = false;
	try {
		const result = await environment.videoDecoder.isConfigSupported(config);
		if (!result.supported) {
			return {
				supported: false,
				reason: 'decoder-config-unsupported',
				config
			};
		}
		decoderSupported = true;
	} catch {
		return {
			supported: false,
			reason: 'decoder-probe-failed',
			config
		};
	}
	if (!decoderSupported || environment.sampleFrameProbe === null) {
		return {
			supported: false,
			reason: 'sample-frame-probe-failed',
			config
		};
	}
	try {
		if (!(await environment.sampleFrameProbe(config))) {
			return {
				supported: false,
				reason: 'sample-frame-probe-failed',
				config
			};
		}
	} catch {
		return {
			supported: false,
			reason: 'sample-frame-probe-failed',
			config
		};
	}
	return { supported: true, reason: null, config };
}
