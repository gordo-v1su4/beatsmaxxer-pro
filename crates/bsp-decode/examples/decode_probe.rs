use std::collections::HashMap;
use std::thread;
use std::time::{Duration, Instant};

use bsp_decode::{DecodeScheduler, PROGRAM_FRAME_PREFIX};

fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("usage: decode_probe <video.mp4> [preview-lanes] [seconds] [pgm]");
    let preview_lanes = std::env::args()
        .nth(2)
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(1);
    let seconds = std::env::args()
        .nth(3)
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(5);
    let include_program = std::env::args().nth(4).as_deref() == Some("pgm");
    let mut scheduler = DecodeScheduler::default();
    scheduler.update_transport(0, true, 1.0, 1, Default::default());
    for lane in 0..preview_lanes {
        scheduler
            .open_clip(format!("preview-{lane}"), path.clone())
            .expect("open native clip");
    }
    if include_program {
        scheduler
            .set_program_source(Some("preview-0".into()))
            .expect("select program source");
    }
    scheduler.start();
    let started = Instant::now();
    let mut counts = HashMap::<String, u64>::new();
    let mut dimensions = HashMap::<String, (u32, u32)>::new();
    while started.elapsed() < Duration::from_secs(seconds) {
        scheduler.update_transport(
            started.elapsed().as_micros() as i64,
            true,
            1.0,
            1,
            Default::default(),
        );
        for frame in scheduler.tick_native_frames().expect("decode frames") {
            assert!(frame.has_iosurface(), "frame is not IOSurface-backed");
            *counts.entry(frame.module_id.clone()).or_default() += 1;
            dimensions.insert(frame.module_id, (frame.width, frame.height));
        }
        thread::sleep(Duration::from_millis(2));
    }

    let elapsed = started.elapsed().as_secs_f64();
    for lane in 0..preview_lanes {
        let source_id = format!("preview-{lane}");
        let count = counts.get(&source_id).copied().unwrap_or(0);
        let size = dimensions.get(&source_id).copied().unwrap_or_default();
        println!(
            "backend={} role=preview slot={} size={}x{} frames={} fps={:.2}",
            bsp_decode::backend_name(),
            source_id,
            size.0,
            size.1,
            count,
            count as f64 / elapsed,
        );
    }
    if include_program {
        let (source_id, count) = counts
            .iter()
            .find(|(source_id, _)| source_id.starts_with(PROGRAM_FRAME_PREFIX))
            .map(|(source_id, count)| (source_id.as_str(), *count))
            .unwrap_or(("missing", 0));
        let size = dimensions.get(source_id).copied().unwrap_or_default();
        println!(
            "backend={} role=program source={} size={}x{} frames={} fps={:.2}",
            bsp_decode::backend_name(),
            source_id,
            size.0,
            size.1,
            count,
            count as f64 / elapsed,
        );
    }
}
