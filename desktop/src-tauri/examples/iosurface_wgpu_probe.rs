fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("usage: iosurface_wgpu_probe <video.mp4>");
    let proof = beatsmaxxer_pro_desktop_lib::renderer::run_iosurface_wgpu_proof(&path)
        .expect("IOSurface -> wgpu proof failed");
    println!(
        "{}",
        serde_json::to_string_pretty(&proof).expect("serialize proof")
    );
}
