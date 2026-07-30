import type {
	ClipAsset,
	DemuxedVideoTrack,
	EncodedVideoSample,
	VideoDecoderConfigLike
} from '$lib/media/types';

function copySample(sample: EncodedVideoSample): EncodedVideoSample {
	const data = sample.data.slice();
	const copy = {
		index: sample.index,
		decodeTimestampUs: sample.decodeTimestampUs,
		timestampUs: sample.timestampUs,
		durationUs: sample.durationUs,
		type: sample.type
	} as EncodedVideoSample;
	Object.defineProperty(copy, 'data', {
		enumerable: true,
		configurable: false,
		get() {
			return data.slice();
		}
	});
	return Object.freeze(copy);
}

function copyDecoderConfig(config: VideoDecoderConfigLike): VideoDecoderConfigLike {
	const storedDescription =
		config.description instanceof ArrayBuffer
			? config.description.slice(0)
			: ArrayBuffer.isView(config.description)
				? new Uint8Array(
						config.description.buffer,
						config.description.byteOffset,
						config.description.byteLength
					).slice()
				: undefined;
	const copy = {
		codec: config.codec,
		codedWidth: config.codedWidth,
		codedHeight: config.codedHeight
	} as VideoDecoderConfigLike;
	if (storedDescription) {
		Object.defineProperty(copy, 'description', {
			enumerable: true,
			configurable: false,
			get() {
				return storedDescription.slice();
			}
		});
	}
	return copy;
}

export function createClipAsset(id: string, track: DemuxedVideoTrack): ClipAsset {
	if (id.length === 0) throw new Error('clip-id-required');
	if (track.samples.length === 0) throw new Error('video-samples-required');

	const samples = track.samples.map(copySample);
	for (let index = 0; index < samples.length; index += 1) {
		const sample = samples[index];
		if (sample.index !== index) throw new Error('sample-index-not-contiguous');
		if (
			!Number.isFinite(sample.timestampUs) ||
			sample.timestampUs < 0 ||
			!Number.isFinite(sample.decodeTimestampUs) ||
			sample.decodeTimestampUs < 0 ||
			!Number.isFinite(sample.durationUs) ||
			sample.durationUs <= 0
		) {
			throw new Error('invalid-sample-timing');
		}
		if (index > 0 && sample.decodeTimestampUs < samples[index - 1].decodeTimestampUs) {
			throw new Error('sample-decode-order-not-monotonic');
		}
	}
	if (samples[0].type !== 'key') throw new Error('first-sample-not-keyframe');

	const keyframeSampleIndexes = samples
		.filter((sample) => sample.type === 'key')
		.map((sample) => sample.index);
	const startTimestampUs = Math.min(...samples.map((sample) => sample.timestampUs));
	const endTimestampUs = Math.max(
		...samples.map((sample) => sample.timestampUs + sample.durationUs)
	);

	return Object.freeze({
		id,
		startTimestampUs,
		durationUs: endTimestampUs - startTimestampUs,
		metadata: Object.freeze({ ...track.metadata }),
		decoderConfig: Object.freeze(copyDecoderConfig(track.decoderConfig)),
		samples: Object.freeze(samples),
		keyframeSampleIndexes: Object.freeze(keyframeSampleIndexes)
	});
}
