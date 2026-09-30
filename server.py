"""Local photo album server. Run with: python3 server.py"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import threading
import uuid

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "local_photos"
IMAGES = DATA / "images"
ORIGINALS = DATA / "originals"
INDEX = DATA / "photos.json"
MAX_UPLOAD = 40 * 1024 * 1024
LOCK = threading.Lock()
ALLOWED = {".jpg", ".jpeg", ".png", ".heic", ".heif"}


def photos():
    return json.loads(INDEX.read_text()) if INDEX.exists() else []


def save(items):
    DATA.mkdir(exist_ok=True)
    temp = INDEX.with_suffix(".tmp")
    temp.write_text(json.dumps(items, ensure_ascii=False, indent=2))
    os.replace(temp, INDEX)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def reply(self, code, value):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/photos":
            return self.reply(200, photos())
        if path.startswith("/.git/"):
            return self.send_error(404)
        if path.startswith("/local_photos/"):
            prefix = "/local_photos/images/"
            if not path.startswith(prefix) or not path.endswith(".jpg"):
                return self.send_error(404)
            name = path[len(prefix):]
            if "/" in name or ".." in name:
                return self.send_error(404)
            image = IMAGES / name
            if not image.is_file():
                return self.send_error(404)
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(image.stat().st_size))
            self.end_headers()
            with image.open("rb") as content:
                self.wfile.write(content.read())
            return
        return super().do_GET()

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path.startswith("/local_photos/") or path.startswith("/.git/"):
            return self.send_error(404)
        return super().do_HEAD()

    def do_POST(self):
        if self.path != "/api/photos":
            return self.send_error(404)
        name = unquote(self.headers.get("X-Photo-Name", "photo"))
        suffix = Path(name).suffix.lower()
        length = int(self.headers.get("Content-Length", "0"))
        if suffix not in ALLOWED or not 0 < length <= MAX_UPLOAD:
            return self.reply(400, {"error": "仅支持 40 MB 以下的 JPG、PNG、HEIC 照片"})
        DATA.mkdir(exist_ok=True)
        IMAGES.mkdir(exist_ok=True)
        ORIGINALS.mkdir(exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=DATA, suffix=suffix, delete=False) as tmp:
            source = Path(tmp.name)
            remaining = length
            while remaining:
                block = self.rfile.read(min(1024 * 1024, remaining))
                if not block:
                    source.unlink(missing_ok=True)
                    return self.reply(400, {"error": "上传中断"})
                tmp.write(block)
                remaining -= len(block)
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        with LOCK:
            if any(item["sha256"] == digest for item in photos()):
                source.unlink()
                return self.reply(409, {"error": "照片已导入，跳过重复文件"})
            photo_id = uuid.uuid4().hex
            preview = IMAGES / (photo_id + ".jpg")
            original = ORIGINALS / (photo_id + suffix)
            try:
                raw = subprocess.run(["swift", "-module-cache-path", "/private/tmp/globe-swift-cache",
                                      str(ROOT / "metadata.swift"), str(source)],
                                     check=True, capture_output=True, text=True, timeout=35)
                info = json.loads(raw.stdout)
                if suffix in {".heic", ".heif"}:
                    decoder = shutil.which("heif-convert")
                    if not decoder:
                        raise ValueError("HEIC 预览需要 heif-convert（可运行 brew install libheif）")
                    converted = DATA / (photo_id + "-converted.jpg")
                    try:
                        subprocess.run([decoder, "-q", "84", str(source), str(converted)],
                                       check=True, capture_output=True, timeout=30)
                        subprocess.run(["sips", "-Z", "2000", str(converted), "--out", str(preview)],
                                       check=True, capture_output=True, timeout=30)
                    finally:
                        converted.unlink(missing_ok=True)
                else:
                    subprocess.run(["sips", "-s", "format", "jpeg", "-Z", "2000",
                                    str(source), "--out", str(preview)],
                                   check=True, capture_output=True, timeout=30)
                os.replace(source, original)
                item = {"id": photo_id, "name": Path(name).name, "sha256": digest,
                        "latitude": info.get("latitude"), "longitude": info.get("longitude"),
                        "takenAt": info.get("takenAt"), "city": None,
                        "preview": "/local_photos/images/" + preview.name}
                items = photos()
                items.append(item)
                save(items)
                return self.reply(201, item)
            except (subprocess.SubprocessError, ValueError, OSError) as error:
                source.unlink(missing_ok=True)
                preview.unlink(missing_ok=True)
                original.unlink(missing_ok=True)
                return self.reply(400, {"error": "照片处理失败：" + str(error)[:100]})

    def do_PATCH(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/photos/"):
            return self.send_error(404)
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length < 500:
            return self.reply(400, {"error": "请求无效"})
        try:
            city = json.loads(self.rfile.read(length))["city"]
        except (ValueError, KeyError, TypeError):
            return self.reply(400, {"error": "城市无效"})
        if city is not None and (not isinstance(city, str) or len(city) > 80):
            return self.reply(400, {"error": "城市无效"})
        with LOCK:
            items = photos()
            for item in items:
                if item["id"] == path.split("/")[-1]:
                    item["city"] = city
                    save(items)
                    return self.reply(200, item)
        return self.reply(404, {"error": "照片不存在"})


if __name__ == "__main__":
    print("本地旅行地球仪：http://127.0.0.1:8000", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
