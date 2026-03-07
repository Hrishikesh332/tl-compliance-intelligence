import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
DEFAULT_INPUT = PROJECT_ROOT / "new-videos" / "Owensboro Police Bodycam Andrew Hurt Jan 2024.mp4"
BODYCAM_DIR = PROJECT_ROOT / "bodycam"
DEFAULT_SIZE_MB = 90
DEFAULT_HEIGHT = 480  # 480p
AUDIO_BITRATE_K = 96  # kbps; rest of bitrate budget goes to video


def get_duration_seconds(path: Path) -> float | None:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=str(PROJECT_ROOT),
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    try:
        return float(result.stdout.strip())
    except ValueError:
        return None


def main():
    args = [a for a in sys.argv[1:] if a.startswith("--")]
    rest = [a for a in sys.argv[1:] if not a.startswith("--")]
    input_path = Path(rest[0]).resolve() if rest else DEFAULT_INPUT
    do_index = "--index" in args
    target_height = 720 if "--720" in args else DEFAULT_HEIGHT
    target_size_mb = 100 if "--100mb" in args else DEFAULT_SIZE_MB

    if not input_path.is_file():
        print("Input file not found:", input_path)
        sys.exit(1)

    size_bytes = input_path.stat().st_size
    size_mb = size_bytes / (1024 * 1024)
    print("Input:", input_path.name)
    print("Current size: {:.1f} MB ({:,} bytes)".format(size_mb, size_bytes))

    duration = get_duration_seconds(input_path)
    if duration is None or duration <= 0:
        print("Could not get duration (is ffprobe installed?). Aborting.")
        sys.exit(1)
    print("Duration: {:.1f} s ({:.1f} min)".format(duration, duration / 60))

    BODYCAM_DIR.mkdir(parents=True, exist_ok=True)
    output_path = BODYCAM_DIR / input_path.name
    if output_path.resolve() == input_path.resolve():
        output_path = BODYCAM_DIR / (input_path.stem + "_{}p".format(target_height) + input_path.suffix)

    # Target size: (video_bitrate + audio_bitrate) * duration / 8 = size_bytes
    target_bits = target_size_mb * 1024 * 1024 * 8
    video_k = max(200, int((target_bits / 1000 / duration) - AUDIO_BITRATE_K))
    print("Target: {}p, ~{} MB -> video bitrate {} kbps, audio {} kbps".format(
        target_height, target_size_mb, video_k, AUDIO_BITRATE_K))

    # Tolerate corrupt/quirky bodycam streams: ignore decode errors, genpts
    def run_ffmpeg(with_audio: bool) -> int:
        cmd = [
            "ffmpeg", "-y", "-loglevel", "warning",
            "-fflags", "+genpts+igndts", "-err_detect", "ignore_err",
            "-i", str(input_path),
            "-vf", "scale=-2:{}".format(target_height),
            "-c:v", "libx264", "-b:v", "{}k".format(video_k), "-maxrate", "{}k".format(int(video_k * 1.2)), "-bufsize", "{}k".format(video_k * 2),
        ]
        if with_audio:
            cmd += ["-c:a", "aac", "-b:a", "{}k".format(AUDIO_BITRATE_K), "-ac", "2", "-ar", "48000"]
        else:
            cmd += ["-an"]
        cmd += ["-movflags", "+faststart", "-max_muxing_queue_size", "1024", str(output_path)]
        return subprocess.run(cmd, cwd=str(PROJECT_ROOT), timeout=3600, capture_output=True).returncode

    print("Transcoding to:", output_path)
    result = run_ffmpeg(with_audio=True)
    if result != 0:
        print("Transcode with audio failed (source audio may be corrupt). Retrying video-only...")
        result = run_ffmpeg(with_audio=False)
    if result != 0:
        print("ffmpeg failed with return code", result)
        sys.exit(1)

    out_size = output_path.stat().st_size
    out_mb = out_size / (1024 * 1024)
    print("Output size: {:.1f} MB ({:,} bytes)".format(out_mb, out_size))

    if do_index:
        print("\nRunning bodycam indexing on", BODYCAM_DIR)
        result = subprocess.run(
            [sys.executable, str(BACKEND_DIR / "scripts" / "index_bodycam.py"), str(BODYCAM_DIR)],
            cwd=str(BACKEND_DIR),
        )
        if result.returncode != 0:
            sys.exit(result.returncode)
    else:
        print("\nTo index this video, run:")
        print("  cd backend && python scripts/index_bodycam.py", str(BODYCAM_DIR))


if __name__ == "__main__":
    main()
