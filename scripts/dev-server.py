#!/usr/bin/env python3
"""Local dev server with Vercel-style rewrites for clean URLs."""

from __future__ import annotations

import argparse
import http.server
import os
import re
import socketserver
import urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

REWRITES = [
    (re.compile(r"^/curate/group/([^/]+)/?$"), "/curate/group/index.html"),
    (re.compile(r"^/gallery/([^/]+)/([^/]+)/?$"), "/album/index.html"),
    (re.compile(r"^/gallery/([^/]+)/?$"), "/group/index.html"),
    (re.compile(r"^/album/([^/]+)/?$"), "/album/index.html"),
    (re.compile(r"^/curate/([^/]+)/?$"), "/curate/index.html"),
]


def resolve_path(path: str) -> str | None:
    parsed = urllib.parse.urlparse(path)
    pathname = parsed.path or "/"

    if pathname != "/" and not pathname.endswith("/"):
        # Match Vercel trailingSlash behavior for directory routes.
        candidate = os.path.join(ROOT, pathname.lstrip("/"), "index.html")
        if os.path.isfile(candidate):
            pathname = pathname + "/"

    for pattern, dest in REWRITES:
        if pattern.match(pathname):
            return dest

    if pathname == "/":
        return "/index.html"

    rel = pathname.lstrip("/")
    file_path = os.path.join(ROOT, rel)

    if os.path.isfile(file_path):
        return pathname

    if pathname.endswith("/"):
        index_path = os.path.join(file_path, "index.html")
        if os.path.isfile(index_path):
            return os.path.join(pathname, "index.html").replace("\\", "/")

    index_path = os.path.join(file_path, "index.html")
    if os.path.isfile(index_path):
        return os.path.join(pathname, "index.html").replace("\\", "/")

    return None


class DevHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self) -> None:
        target = resolve_path(self.path)
        if target is None:
            self.send_error(http.HTTPStatus.NOT_FOUND, "File not found")
            return
        self.path = target
        return super().do_GET()

    def log_message(self, fmt: str, *args) -> None:
        print(f"[dev] {self.address_string()} - {fmt % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Photography portfolio local dev server")
    parser.add_argument("--port", type=int, default=4000)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    os.chdir(ROOT)
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer((args.host, args.port), DevHandler) as httpd:
        print(f"Serving {ROOT}")
        print(f"Local: http://{args.host}:{args.port}/")
        print("Clean URLs enabled (album, gallery, curate rewrites)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
