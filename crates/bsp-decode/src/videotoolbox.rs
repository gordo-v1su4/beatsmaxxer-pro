//! macOS hardware decode through AVFoundation's VideoToolbox-backed reader.
//!
//! The reader asks the decoder for IOSurface-backed BGRA pixel buffers and
//! retains those buffers for direct Metal/wgpu import. No pixel bytes are
//! copied here.

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_av_foundation::{
    AVAssetReader, AVAssetReaderOutput, AVAssetReaderTrackOutput, AVMediaTypeVideo, AVURLAsset,
};
use objc2_core_media::{kCMTimePositiveInfinity, CMTime, CMTimeRange};
use objc2_core_video::{kCVPixelFormatType_32BGRA, CVPixelBufferGetPixelFormatType};
use objc2_foundation::{ns_string, NSDictionary, NSNumber, NSString, NSURL};

use crate::{DecodeError, NativeDecodeFrame};

pub struct VideoToolboxDecoder {
    reader: Retained<AVAssetReader>,
    output: Retained<AVAssetReaderTrackOutput>,
}

impl VideoToolboxDecoder {
    pub fn open(
        path: &str,
        target_width: u32,
        target_height: u32,
        start_us: i64,
    ) -> Result<Self, DecodeError> {
        let path = NSString::from_str(path);
        let url = NSURL::fileURLWithPath(&path);
        let asset = unsafe { AVURLAsset::URLAssetWithURL_options(&url, None) };
        let media_type = unsafe { AVMediaTypeVideo }
            .ok_or_else(|| DecodeError::Decode("AVMediaTypeVideo unavailable".into()))?;
        #[allow(deprecated)]
        let tracks = unsafe { asset.tracksWithMediaType(media_type) };
        let track = tracks
            .firstObject()
            .ok_or_else(|| DecodeError::Decode("video track not found".into()))?;

        let pixel_format: Retained<AnyObject> = NSNumber::new_u32(kCVPixelFormatType_32BGRA).into();
        let width: Retained<AnyObject> = NSNumber::new_u32(target_width).into();
        let height: Retained<AnyObject> = NSNumber::new_u32(target_height).into();
        let iosurface_properties: Retained<AnyObject> =
            NSDictionary::<NSString, AnyObject>::new().into();
        let metal_compatible: Retained<AnyObject> = NSNumber::new_bool(true).into();
        let settings = NSDictionary::from_retained_objects(
            &[
                ns_string!("PixelFormatType"),
                ns_string!("Width"),
                ns_string!("Height"),
                ns_string!("IOSurfaceProperties"),
                ns_string!("MetalCompatibility"),
            ],
            &[
                pixel_format,
                width,
                height,
                iosurface_properties,
                metal_compatible,
            ],
        );
        let output = unsafe {
            AVAssetReaderTrackOutput::assetReaderTrackOutputWithTrack_outputSettings(
                &track,
                Some(&settings),
            )
        };
        unsafe { output.setAlwaysCopiesSampleData(false) };

        let reader = unsafe { AVAssetReader::assetReaderWithAsset_error(&asset) }
            .map_err(|error| DecodeError::Decode(format!("AVAssetReader: {error}")))?;
        if start_us > 0 {
            let start = unsafe { CMTime::new(start_us, 1_000_000) };
            let duration = unsafe { kCMTimePositiveInfinity };
            let range = unsafe { CMTimeRange::new(start, duration) };
            unsafe { reader.setTimeRange(range) };
        }
        if !unsafe { reader.canAddOutput(&output) } {
            return Err(DecodeError::Decode(
                "AVAssetReader rejected the VideoToolbox output".into(),
            ));
        }
        unsafe { reader.addOutput(&output as &AVAssetReaderOutput) };
        if !unsafe { reader.startReading() } {
            let detail = unsafe { reader.error() }
                .map(|error| error.to_string())
                .unwrap_or_else(|| "unknown AVAssetReader error".into());
            return Err(DecodeError::Decode(detail));
        }

        Ok(Self { reader, output })
    }

    pub fn next_native_frame(
        &mut self,
        module_id: &str,
        sequence: u64,
    ) -> Result<Option<NativeDecodeFrame>, DecodeError> {
        let Some(sample) = (unsafe { self.output.copyNextSampleBuffer() }) else {
            let status = unsafe { self.reader.status() };
            if status == objc2_av_foundation::AVAssetReaderStatus::Failed {
                let detail = unsafe { self.reader.error() }
                    .map(|error| error.to_string())
                    .unwrap_or_else(|| "VideoToolbox read failed".into());
                return Err(DecodeError::Decode(detail));
            }
            return Ok(None);
        };
        let Some(pixel_buffer) = (unsafe { sample.image_buffer() }) else {
            return Ok(None);
        };
        if CVPixelBufferGetPixelFormatType(&pixel_buffer) != kCVPixelFormatType_32BGRA {
            return Err(DecodeError::Decode(
                "VideoToolbox returned a non-BGRA pixel buffer".into(),
            ));
        }

        let timestamp = unsafe { sample.presentation_time_stamp() };
        let timestamp_us = unsafe { timestamp.seconds() * 1_000_000.0 } as i64;
        NativeDecodeFrame::from_pixel_buffer(
            module_id.to_string(),
            timestamp_us,
            sequence,
            pixel_buffer,
        )
        .map(Some)
    }
}
