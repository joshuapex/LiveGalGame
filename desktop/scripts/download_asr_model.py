#!/usr/bin/env python3
"""
Download a Faster-Whisper model snapshot with progress metadata.
Outputs newline-delimited JSON that can be consumed by the Electron main process.
"""

import argparse
import json
import os
import sys
import traceback
from typing import Tuple

try:
    from huggingface_hub import HfApi, snapshot_download
except ImportError:
    print(json.dumps({
        "event": "error",
        "message": "huggingface_hub is not installed. Please ensure faster-whisper is installed.",
    }))
    sys.exit(1)


def emit(event: str, **payload):
    """Emit a JSON event to stdout."""
    data = {"event": event}
    data.update(payload)
    sys.stdout.write(json.dumps(data, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def resolve_cache_dir(explicit: str = None) -> str:
    if explicit:
        return explicit
    env_cache = os.environ.get("ASR_CACHE_DIR")
    if env_cache:
        return env_cache
    hf_home = os.environ.get("HF_HOME")
    if hf_home:
        return os.path.join(hf_home, "hub")
    return os.path.expanduser("~/.cache/huggingface/hub")


def collect_repo_metadata(api: HfApi, repo_id: str, revision: str) -> Tuple[int, str, int]:
    """Return (total_bytes, snapshot_sha, file_count)."""
    info = api.model_info(repo_id, revision=revision)
    tree = api.list_repo_tree(repo_id=repo_id, revision=revision, recursive=True)
    total = 0
    files = 0
    for node in tree:
        # 兼容新旧版本的 huggingface_hub
        # 新版返回 RepoFile/RepoFolder 对象，没有 type 属性
        # 旧版返回 dict-like 对象，有 type 属性
        is_file = False
        if hasattr(node, 'type'):
            is_file = node.type == "file"
        else:
            # 新版 huggingface_hub: RepoFile 有 size 和 blob_id 属性，RepoFolder 没有
            is_file = hasattr(node, 'size') and hasattr(node, 'blob_id')
        
        if is_file:
            files += 1
            size = getattr(node, 'size', None)
            if size:
                total += int(size)
    return total, info.sha, files


def main():
    parser = argparse.ArgumentParser(description="Download a Faster-Whisper model with JSON progress output")
    parser.add_argument("--model-id", required=True, help="Short model id (tiny/base/...)")
    parser.add_argument("--repo-id", required=True, help="Repo id (HF or ModelScope)")
    parser.add_argument("--revision", default="main", help="Repo revision/tag (default: main)")
    parser.add_argument("--cache-dir", help="Cache directory")
    parser.add_argument("--jobs", type=int, default=4, help="Max parallel download workers")
    parser.add_argument("--source", default="huggingface", choices=["huggingface", "modelscope"], help="Download source")
    args = parser.parse_args()

    if args.source == "modelscope":
        download_from_modelscope(args)
    else:
        download_from_huggingface(args)


def download_from_huggingface(args):
    cache_dir = resolve_cache_dir(args.cache_dir)
    os.makedirs(cache_dir, exist_ok=True)

    api = HfApi()

    try:
        total_bytes, snapshot_sha, file_count = collect_repo_metadata(api, args.repo_id, args.revision)
        repo_safe = f"models--{args.repo_id.replace('/', '--')}"
        snapshot_rel = os.path.join(repo_safe, "snapshots", snapshot_sha)

        emit(
            "manifest",
            modelId=args.model_id,
            repoId=args.repo_id,
            totalBytes=total_bytes,
            fileCount=file_count,
            cacheDir=os.path.abspath(cache_dir),
            snapshotSha=snapshot_sha,
            snapshotRelativePath=snapshot_rel,
            source="huggingface"
        )

        local_dir = snapshot_download(
            repo_id=args.repo_id,
            revision=args.revision,
            cache_dir=cache_dir,
            max_workers=max(1, args.jobs),
        )

        emit(
            "completed",
            modelId=args.model_id,
            repoId=args.repo_id,
            totalBytes=total_bytes,
            snapshotSha=snapshot_sha,
            localDir=local_dir,
            source="huggingface"
        )
    except KeyboardInterrupt:
        emit("cancelled", modelId=args.model_id, message="Download cancelled by user")
        sys.exit(1)
    except Exception as exc:
        emit("error", modelId=args.model_id, message=str(exc), traceback=traceback.format_exc())
        sys.exit(1)


def download_from_modelscope(args):
    try:
        from modelscope.hub.snapshot_download import snapshot_download as ms_snapshot_download
        # ModelScope doesn't have a direct API for file size listing easily accessible without auth sometimes,
        # but we can try. For now, we might skip precise progress if difficult.
    except ImportError:
        emit("error", modelId=args.model_id, message="modelscope library not installed. Please install it with `pip install modelscope`.")
        sys.exit(1)

    # ModelScope cache dir default is ~/.cache/modelscope/hub
    # We can use args.cache_dir if provided, but ModelScope manages its own structure.
    # If we pass cache_dir to ms_snapshot_download, it uses it.
    
    cache_dir = args.cache_dir
    if not cache_dir:
        # Default to standard ModelScope cache if not specified, or use our app cache
        # Better to use our app cache to keep things centralized if possible, 
        # but ModelScope structure is different.
        # Let's use the provided cache_dir (which is our app's cache) but ModelScope will create its own structure inside.
        cache_dir = os.environ.get("ASR_CACHE_DIR") or os.path.expanduser("~/.cache/modelscope/hub")

    try:
        # We don't have easy pre-flight metadata for ModelScope without more complex API calls.
        # So we emit a manifest with unknown size or 0.
        emit(
            "manifest",
            modelId=args.model_id,
            repoId=args.repo_id,
            totalBytes=0, # Unknown
            fileCount=0,
            cacheDir=os.path.abspath(cache_dir),
            snapshotSha="latest", # ModelScope doesn't expose SHA in the same way easily
            snapshotRelativePath=args.repo_id, # ModelScope usually downloads to cache_dir/repo_id
            source="modelscope"
        )

        local_dir = ms_snapshot_download(
            model_id=args.repo_id,
            revision=args.revision if args.revision != "main" else None, # ModelScope uses 'master' or 'v...' usually, 'main' might be invalid
            cache_dir=cache_dir,
        )

        emit(
            "completed",
            modelId=args.model_id,
            repoId=args.repo_id,
            totalBytes=0,
            snapshotSha="latest",
            localDir=local_dir,
            source="modelscope"
        )
    except KeyboardInterrupt:
        emit("cancelled", modelId=args.model_id, message="Download cancelled by user")
        sys.exit(1)
    except Exception as exc:
        emit("error", modelId=args.model_id, message=str(exc), traceback=traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()

