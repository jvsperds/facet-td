"""Local-only preview; use three.js already installed in the repository."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / "docs" / "art"
checkout = ROOT
marker = ROOT / ".git"
if marker.is_file():
    gitdir = Path(marker.read_text().strip().removeprefix("gitdir: ").strip())
    if not gitdir.is_absolute():
        gitdir = ROOT / gitdir
    common = (gitdir / (gitdir / "commondir").read_text().strip()).resolve()
    checkout = common.parent
three = checkout / "node_modules" / "three"
VENDOR = {
    "/vendor/three.module.js": three / "build" / "three.module.js",
    "/vendor/three.core.js": three / "build" / "three.core.js",
    "/vendor/OrbitControls.js": three / "examples" / "jsm" / "controls" / "OrbitControls.js",
}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ART), **kwargs)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/environment/")
            self.end_headers()
        elif path in VENDOR:
            body = VENDOR[path].read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

if __name__ == "__main__":
    missing = [str(p) for p in VENDOR.values() if not p.is_file()]
    if missing:
        raise SystemExit("Installed three.js not found; install the repository dependencies first: " + ", ".join(missing))
    print("Environment preview: http://127.0.0.1:8768/environment/", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8768), Handler).serve_forever()
