from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request, send_file

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
TEMP_DIR = DATA_DIR / "temp"
STATE_FILE = DATA_DIR / "state.json"

DEFAULT_INPUT_DIR = Path("C:/Users/Test/SCPrototype/Assets/_SwarmBreakers/Audio/Staging")
DEFAULT_OUTPUT_DIR = Path("C:/Users/Test/SCPrototype/Assets/_SwarmBreakers/Audio/Processed")

AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac"}

state_lock = threading.Lock()
jobs_lock = threading.Lock()
jobs: dict[str, dict[str, Any]] = {}


@dataclass
class RuntimeTools:
    ffmpeg: str | None
    ffprobe: str | None


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def default_state() -> dict[str, Any]:
    return {
        "config": {
            "input_dir": str(DEFAULT_INPUT_DIR),
            "output_dir": str(DEFAULT_OUTPUT_DIR),
            "preset": "music",
            "sample_rate": 48000,
            "bit_depth": 24,
            "fade_in_ms": 10,
            "fade_out_ms": 120,
            "trim_silence": False,
            "trim_db": -50,
            "lufs_music": -16.0,
            "lufs_sfx": -18.0,
            "peak_db": -1.0,
            "highpass_hz": 30,
        },
        "approved": [],
        "file_overrides": {},
    }


def load_state() -> dict[str, Any]:
    ensure_dirs()
    if not STATE_FILE.exists():
        data = default_state()
        save_state(data)
        return data
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            data = default_state()
        if "config" not in data or not isinstance(data.get("config"), dict):
            data["config"] = default_state()["config"]
        if "approved" not in data or not isinstance(data.get("approved"), list):
            data["approved"] = []
        if "file_overrides" not in data or not isinstance(data.get("file_overrides"), dict):
            data["file_overrides"] = {}
        return data
    except Exception:
        data = default_state()
        save_state(data)
        return data


def save_state(data: dict[str, Any]) -> None:
    ensure_dirs()
    STATE_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def normalize_path(path_value: str) -> str:
    return str(Path(path_value).resolve())


def resolve_runtime_tools() -> RuntimeTools:
    env_ffmpeg = os.environ.get("FFMPEG_PATH")
    if env_ffmpeg and Path(env_ffmpeg).exists():
        ffmpeg = str(Path(env_ffmpeg).resolve())
    else:
        found = shutil.which("ffmpeg")
        ffmpeg = found if found else None
        if not ffmpeg:
            try:
                import imageio_ffmpeg  # type: ignore

                ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
            except Exception:
                ffmpeg = None

    env_ffprobe = os.environ.get("FFPROBE_PATH")
    if env_ffprobe and Path(env_ffprobe).exists():
        ffprobe = str(Path(env_ffprobe).resolve())
    else:
        found_probe = shutil.which("ffprobe")
        if found_probe:
            ffprobe = found_probe
        elif ffmpeg:
            maybe_probe = Path(ffmpeg).with_name("ffprobe.exe")
            ffprobe = str(maybe_probe) if maybe_probe.exists() else None
        else:
            ffprobe = None

    return RuntimeTools(ffmpeg=ffmpeg, ffprobe=ffprobe)


def get_duration_seconds(file_path: Path, tools: RuntimeTools) -> float | None:
    if tools.ffprobe:
        try:
            result = subprocess.run(
                [
                    tools.ffprobe,
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(file_path),
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            value = result.stdout.strip()
            if value:
                return float(value)
        except Exception:
            pass

    if file_path.suffix.lower() == ".wav":
        try:
            with wave.open(str(file_path), "rb") as wav_file:
                frames = wav_file.getnframes()
                rate = wav_file.getframerate()
                if rate > 0:
                    return frames / float(rate)
        except Exception:
            return None
    return None


def get_stream_info(file_path: Path, tools: RuntimeTools) -> dict[str, Any]:
    info: dict[str, Any] = {"sample_rate": None, "channels": None, "bits_per_sample": None}
    if not tools.ffprobe:
        return info
    try:
        result = subprocess.run(
            [
                tools.ffprobe,
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=sample_rate,channels,bits_per_sample",
                "-of",
                "json",
                str(file_path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        payload = json.loads(result.stdout or "{}")
        streams = payload.get("streams", [])
        if isinstance(streams, list) and streams:
            stream0 = streams[0] if isinstance(streams[0], dict) else {}
            info["sample_rate"] = stream0.get("sample_rate")
            info["channels"] = stream0.get("channels")
            info["bits_per_sample"] = stream0.get("bits_per_sample")
    except Exception:
        return info
    return info


def run_volumedetect(file_path: Path, tools: RuntimeTools) -> dict[str, Any]:
    stats: dict[str, Any] = {"max_volume_db": None, "mean_volume_db": None}
    if not tools.ffmpeg:
        return stats

    null_sink = "NUL" if os.name == "nt" else "/dev/null"
    try:
        result = subprocess.run(
            [
                tools.ffmpeg,
                "-hide_banner",
                "-nostats",
                "-i",
                str(file_path),
                "-af",
                "volumedetect",
                "-f",
                "null",
                null_sink,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        text = f"{result.stdout}\n{result.stderr}"
        max_match = re.search(r"max_volume:\s*([-\d.]+)\s*dB", text)
        mean_match = re.search(r"mean_volume:\s*([-\d.]+)\s*dB", text)
        if max_match:
            stats["max_volume_db"] = float(max_match.group(1))
        if mean_match:
            stats["mean_volume_db"] = float(mean_match.group(1))
    except Exception:
        return stats
    return stats


def quick_qc_report(file_path: Path, tools: RuntimeTools) -> dict[str, Any]:
    duration = get_duration_seconds(file_path, tools)
    stream_info = get_stream_info(file_path, tools)
    volume_info = run_volumedetect(file_path, tools)

    max_volume_db = volume_info.get("max_volume_db")
    clipped = bool(max_volume_db is not None and float(max_volume_db) >= -0.1)

    notes: list[str] = []
    if duration is not None and duration <= 0.05:
        notes.append("Very short duration.")
    if clipped:
        notes.append("Possible clipping risk (max volume >= -0.1 dB).")
    if max_volume_db is None:
        notes.append("Max volume could not be measured.")

    return {
        "duration_seconds": duration,
        "duration_label": format_duration(duration),
        "sample_rate": stream_info.get("sample_rate"),
        "channels": stream_info.get("channels"),
        "bits_per_sample": stream_info.get("bits_per_sample"),
        "max_volume_db": max_volume_db,
        "mean_volume_db": volume_info.get("mean_volume_db"),
        "clipping_risk": clipped,
        "notes": notes,
    }


def format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "--:--"
    total = max(int(seconds), 0)
    m, s = divmod(total, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def list_audio_files(root_dir: Path, tools: RuntimeTools) -> list[dict[str, Any]]:
    if not root_dir.exists():
        return []

    files: list[dict[str, Any]] = []
    for file_path in root_dir.rglob("*"):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in AUDIO_EXTENSIONS:
            continue
        duration = get_duration_seconds(file_path, tools)
        stat = file_path.stat()
        files.append(
            {
                "name": file_path.name,
                "path": str(file_path.resolve()),
                "relative_path": str(file_path.resolve().relative_to(root_dir.resolve())),
                "duration_seconds": duration,
                "duration_label": format_duration(duration),
                "size_bytes": stat.st_size,
                "modified_epoch": stat.st_mtime,
            }
        )
    files.sort(key=lambda item: item["relative_path"].lower())
    return files


def db_to_linear(db_value: float) -> float:
    return max(0.00001, 10 ** (db_value / 20.0))


def build_filter_chain(config: dict[str, Any], preset: str, duration_seconds: float | None) -> str:
    filters: list[str] = []

    trim_enabled = bool(config.get("trim_silence", False))
    trim_db = float(config.get("trim_db", -50))
    if trim_enabled:
        filters.append(
            "silenceremove="
            f"start_periods=1:start_duration=0.02:start_threshold={trim_db}dB:"
            f"stop_periods=1:stop_duration=0.02:stop_threshold={trim_db}dB"
        )

    peak_db = float(config.get("peak_db", -1.0))
    limiter_limit = db_to_linear(peak_db)

    if preset == "music":
        highpass_hz = int(config.get("highpass_hz", 30))
        lufs = float(config.get("lufs_music", -16.0))
        if highpass_hz > 0:
            filters.append(f"highpass=f={highpass_hz}")
        filters.append(f"loudnorm=I={lufs}:TP={peak_db}:LRA=9")
    else:
        lufs = float(config.get("lufs_sfx", -18.0))
        filters.append(f"loudnorm=I={lufs}:TP={peak_db}:LRA=7")

    fade_in_ms = int(config.get("fade_in_ms", 10))
    fade_out_ms = int(config.get("fade_out_ms", 120))
    fade_in_sec = max(fade_in_ms / 1000.0, 0.0)
    fade_out_sec = max(fade_out_ms / 1000.0, 0.0)

    if fade_in_sec > 0:
        filters.append(f"afade=t=in:st=0:d={fade_in_sec:.3f}")
    if duration_seconds and fade_out_sec > 0 and duration_seconds > fade_out_sec:
        start = max(duration_seconds - fade_out_sec, 0.0)
        filters.append(f"afade=t=out:st={start:.3f}:d={fade_out_sec:.3f}")

    filters.append(f"alimiter=limit={limiter_limit:.5f}")
    return ",".join(filters)


def normalize_file_fade_override(raw: Any) -> dict[str, Any]:
    data = raw if isinstance(raw, dict) else {}
    mode = str(data.get("fade_in_mode", "inherit")).strip().lower()
    if mode not in {"inherit", "off", "custom"}:
        mode = "inherit"
    try:
        seconds = float(data.get("fade_in_seconds", 0.0))
    except Exception:
        seconds = 0.0
    seconds = max(0.0, min(seconds, 600.0))
    return {"fade_in_mode": mode, "fade_in_seconds": seconds}


def resolve_file_fade_override(state: dict[str, Any], file_path: Path) -> dict[str, Any]:
    overrides = state.get("file_overrides", {})
    if not isinstance(overrides, dict):
        return {"fade_in_mode": "inherit", "fade_in_seconds": 0.0}
    return normalize_file_fade_override(overrides.get(str(file_path.resolve()), {}))


def apply_file_override_to_config(base_config: dict[str, Any], file_override: dict[str, Any]) -> dict[str, Any]:
    effective = dict(base_config)
    mode = str(file_override.get("fade_in_mode", "inherit"))
    if mode == "off":
        effective["fade_in_ms"] = 0
    elif mode == "custom":
        seconds = float(file_override.get("fade_in_seconds", 0.0))
        effective["fade_in_ms"] = int(round(max(0.0, min(seconds, 600.0)) * 1000.0))
    return effective


def process_one_file(
    input_file: Path,
    output_file: Path,
    config: dict[str, Any],
    tools: RuntimeTools,
    preset: str,
) -> tuple[bool, str]:
    if not tools.ffmpeg:
        return False, "ffmpeg not found."

    output_file.parent.mkdir(parents=True, exist_ok=True)
    duration_seconds = get_duration_seconds(input_file, tools)
    filter_chain = build_filter_chain(config, preset, duration_seconds)

    sample_rate = int(config.get("sample_rate", 48000))
    bit_depth = int(config.get("bit_depth", 24))
    codec = "pcm_s24le" if bit_depth == 24 else "pcm_s16le"

    command = [
        tools.ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(input_file),
        "-vn",
        "-af",
        filter_chain,
        "-ar",
        str(sample_rate),
        "-c:a",
        codec,
        str(output_file),
    ]

    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
        return True, "ok"
    except subprocess.CalledProcessError as exc:
        err = (exc.stderr or exc.stdout or str(exc)).strip()
        return False, err[:800]


def is_under_root(file_path: Path, root: Path) -> bool:
    try:
        file_path.resolve().relative_to(root.resolve())
        return True
    except Exception:
        return False


def allowed_audio_path(file_path: Path, config: dict[str, Any]) -> bool:
    input_dir = Path(config.get("input_dir", "")).resolve()
    output_dir = Path(config.get("output_dir", "")).resolve()
    return (
        is_under_root(file_path, input_dir)
        or is_under_root(file_path, output_dir)
        or is_under_root(file_path, TEMP_DIR)
    )


def create_app() -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static")

    @app.get("/")
    def index() -> str:
        return render_template("index.html")

    @app.get("/api/health")
    def health() -> Any:
        with state_lock:
            current_state = load_state()
        tools = resolve_runtime_tools()
        return jsonify(
            {
                "ok": True,
                "ffmpeg_path": tools.ffmpeg,
                "ffprobe_path": tools.ffprobe,
                "state": current_state,
            }
        )

    @app.post("/api/config")
    def update_config() -> Any:
        payload = request.get_json(silent=True) or {}
        with state_lock:
            current_state = load_state()
            config = current_state.get("config", {})
            allowed_keys = {
                "input_dir",
                "output_dir",
                "preset",
                "sample_rate",
                "bit_depth",
                "fade_in_ms",
                "fade_out_ms",
                "trim_silence",
                "trim_db",
                "lufs_music",
                "lufs_sfx",
                "peak_db",
                "highpass_hz",
            }
            for key, value in payload.items():
                if key not in allowed_keys:
                    continue
                config[key] = value
            config["input_dir"] = normalize_path(str(config.get("input_dir", DEFAULT_INPUT_DIR)))
            config["output_dir"] = normalize_path(str(config.get("output_dir", DEFAULT_OUTPUT_DIR)))
            Path(config["output_dir"]).mkdir(parents=True, exist_ok=True)
            current_state["config"] = config
            save_state(current_state)
        return jsonify({"ok": True, "config": current_state["config"]})

    @app.post("/api/scan")
    def scan_files() -> Any:
        tools = resolve_runtime_tools()
        with state_lock:
            current_state = load_state()
        config = current_state.get("config", {})
        root = Path(config.get("input_dir", DEFAULT_INPUT_DIR)).resolve()
        files = list_audio_files(root, tools)
        approved = set(current_state.get("approved", []))
        for item in files:
            item["approved"] = item["path"] in approved
            file_override = resolve_file_fade_override(current_state, Path(item["path"]))
            item["fade_in_mode"] = file_override["fade_in_mode"]
            item["fade_in_seconds"] = file_override["fade_in_seconds"]
        return jsonify({"ok": True, "files": files})

    @app.post("/api/approve")
    def approve_file() -> Any:
        payload = request.get_json(silent=True) or {}
        target = payload.get("path")
        approved_value = bool(payload.get("approved", True))
        if not target:
            return jsonify({"ok": False, "error": "Missing path"}), 400

        with state_lock:
            current_state = load_state()
            config = current_state.get("config", {})
            target_path = Path(target).resolve()
            if not is_under_root(target_path, Path(config.get("input_dir", DEFAULT_INPUT_DIR))):
                return jsonify({"ok": False, "error": "Path is outside input directory"}), 400
            approved_set = set(current_state.get("approved", []))
            if approved_value:
                approved_set.add(str(target_path))
            else:
                approved_set.discard(str(target_path))
            current_state["approved"] = sorted(approved_set)
            save_state(current_state)
        return jsonify({"ok": True, "approved_count": len(current_state["approved"])})

    @app.post("/api/file/fadein")
    def set_file_fadein() -> Any:
        payload = request.get_json(silent=True) or {}
        target = payload.get("path")
        if not target:
            return jsonify({"ok": False, "error": "Missing path"}), 400

        mode = str(payload.get("mode", "inherit")).strip().lower()
        if mode not in {"inherit", "off", "custom"}:
            return jsonify({"ok": False, "error": "Invalid mode"}), 400

        try:
            seconds = float(payload.get("seconds", 0.0))
        except Exception:
            return jsonify({"ok": False, "error": "Invalid seconds"}), 400
        seconds = max(0.0, min(seconds, 600.0))

        with state_lock:
            current_state = load_state()
            config = current_state.get("config", {})
            input_dir = Path(config.get("input_dir", DEFAULT_INPUT_DIR)).resolve()
            target_path = Path(target).resolve()
            if not is_under_root(target_path, input_dir):
                return jsonify({"ok": False, "error": "Path is outside input directory"}), 400

            overrides = current_state.get("file_overrides", {})
            if not isinstance(overrides, dict):
                overrides = {}
            key = str(target_path)

            if mode == "inherit":
                overrides.pop(key, None)
            else:
                overrides[key] = {"fade_in_mode": mode, "fade_in_seconds": seconds}

            current_state["file_overrides"] = overrides
            save_state(current_state)

            applied = resolve_file_fade_override(current_state, target_path)
            effective = apply_file_override_to_config(config, applied)
            return jsonify(
                {
                    "ok": True,
                    "path": key,
                    "fade_in_mode": applied["fade_in_mode"],
                    "fade_in_seconds": applied["fade_in_seconds"],
                    "effective_fade_in_ms": int(effective.get("fade_in_ms", 0)),
                }
            )

    @app.get("/api/audio")
    def audio_stream() -> Any:
        file_path_value = request.args.get("path", "").strip()
        if not file_path_value:
            return jsonify({"ok": False, "error": "Missing path"}), 400
        target = Path(file_path_value).resolve()
        with state_lock:
            current_state = load_state()
        if not target.exists() or not target.is_file():
            return jsonify({"ok": False, "error": "File not found"}), 404
        if not allowed_audio_path(target, current_state.get("config", {})):
            return jsonify({"ok": False, "error": "Path not allowed"}), 403
        return send_file(str(target), conditional=True)

    @app.post("/api/qc")
    def quick_qc() -> Any:
        payload = request.get_json(silent=True) or {}
        target = payload.get("path")
        if not target:
            return jsonify({"ok": False, "error": "Missing path"}), 400

        target_path = Path(target).resolve()
        with state_lock:
            current_state = load_state()

        if not target_path.exists() or not target_path.is_file():
            return jsonify({"ok": False, "error": "File not found"}), 404
        if not allowed_audio_path(target_path, current_state.get("config", {})):
            return jsonify({"ok": False, "error": "Path not allowed"}), 403

        tools = resolve_runtime_tools()
        report = quick_qc_report(target_path, tools)
        return jsonify({"ok": True, "qc": report})

    @app.post("/api/preview")
    def preview_selected() -> Any:
        payload = request.get_json(silent=True) or {}
        target = payload.get("path")
        if not target:
            return jsonify({"ok": False, "error": "Missing path"}), 400

        tools = resolve_runtime_tools()
        with state_lock:
            current_state = load_state()
        config = current_state.get("config", {})
        input_dir = Path(config.get("input_dir", DEFAULT_INPUT_DIR)).resolve()
        input_file = Path(target).resolve()

        if not input_file.exists() or not is_under_root(input_file, input_dir):
            return jsonify({"ok": False, "error": "Selected file is invalid"}), 400

        digest = hashlib.sha1(str(input_file).encode("utf-8")).hexdigest()[:10]
        output_name = f"preview_{digest}_{input_file.stem}.wav"
        output_file = TEMP_DIR / output_name

        file_override = resolve_file_fade_override(current_state, input_file)
        effective_config = apply_file_override_to_config(config, file_override)
        ok, message = process_one_file(
            input_file,
            output_file,
            effective_config,
            tools,
            str(config.get("preset", "music")),
        )
        if not ok:
            return jsonify({"ok": False, "error": message}), 500
        return jsonify(
            {
                "ok": True,
                "preview_path": str(output_file.resolve()),
                "fade_in_mode": file_override["fade_in_mode"],
                "fade_in_seconds": file_override["fade_in_seconds"],
            }
        )

    @app.post("/api/process/start")
    def process_start() -> Any:
        payload = request.get_json(silent=True) or {}
        mode = str(payload.get("mode", "approved")).lower()
        if mode not in {"approved", "all"}:
            return jsonify({"ok": False, "error": "Invalid mode"}), 400

        tools = resolve_runtime_tools()
        if not tools.ffmpeg:
            return jsonify({"ok": False, "error": "ffmpeg not found. Set FFMPEG_PATH or install imageio-ffmpeg."}), 400

        with state_lock:
            current_state = load_state()
        config = current_state.get("config", {})
        file_overrides = current_state.get("file_overrides", {})
        if not isinstance(file_overrides, dict):
            file_overrides = {}
        input_dir = Path(config.get("input_dir", DEFAULT_INPUT_DIR)).resolve()
        output_dir = Path(config.get("output_dir", DEFAULT_OUTPUT_DIR)).resolve()

        all_files = list_audio_files(input_dir, tools)
        approved_set = set(current_state.get("approved", []))
        if mode == "approved":
            selected = [Path(item["path"]) for item in all_files if item["path"] in approved_set]
        else:
            selected = [Path(item["path"]) for item in all_files]

        if not selected:
            return jsonify({"ok": False, "error": "No files selected for processing."}), 400

        job_id = str(uuid.uuid4())
        job = {
            "id": job_id,
            "status": "running",
            "mode": mode,
            "started_at": time.time(),
            "finished_at": None,
            "total": len(selected),
            "current_index": 0,
            "current_file": "",
            "processed": 0,
            "errors": [],
            "outputs": [],
        }
        with jobs_lock:
            jobs[job_id] = job

        def worker() -> None:
            preset = str(config.get("preset", "music"))
            for idx, source in enumerate(selected, start=1):
                with jobs_lock:
                    jobs[job_id]["current_index"] = idx
                    jobs[job_id]["current_file"] = str(source)
                try:
                    relative = source.resolve().relative_to(input_dir)
                    target = (output_dir / relative).with_suffix(".wav")
                    file_override = normalize_file_fade_override(file_overrides.get(str(source.resolve()), {}))
                    effective_config = apply_file_override_to_config(config, file_override)
                    ok, message = process_one_file(source, target, effective_config, tools, preset)
                    with jobs_lock:
                        jobs[job_id]["processed"] += 1
                        if ok:
                            jobs[job_id]["outputs"].append(str(target.resolve()))
                        else:
                            jobs[job_id]["errors"].append({"file": str(source), "error": message})
                except Exception as exc:
                    with jobs_lock:
                        jobs[job_id]["processed"] += 1
                        jobs[job_id]["errors"].append({"file": str(source), "error": str(exc)})

            with jobs_lock:
                jobs[job_id]["status"] = "done"
                jobs[job_id]["finished_at"] = time.time()
                jobs[job_id]["current_file"] = ""

        threading.Thread(target=worker, daemon=True).start()
        return jsonify({"ok": True, "job_id": job_id})

    @app.get("/api/process/status/<job_id>")
    def process_status(job_id: str) -> Any:
        with jobs_lock:
            job = jobs.get(job_id)
            if not job:
                return jsonify({"ok": False, "error": "Job not found"}), 404
            return jsonify({"ok": True, "job": job})

    return app


if __name__ == "__main__":
    ensure_dirs()
    app = create_app()
    app.run(host="127.0.0.1", port=5177, debug=False)
