# Local-only preview server. Not part of the deployed site.
# Like `python -m http.server`, but never lets the browser reuse a cached file,
# so edited ES modules are always reloaded.
# Usage: python -I dev/devserver.py <root dir> <port>
import http.server, sys, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        # Ignore conditional requests so the browser always gets the current file.
        for h in ("If-Modified-Since", "If-None-Match"):
            if h in self.headers:
                del self.headers[h]
        return super().send_head()

os.chdir(sys.argv[1])
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[2])), NoCache).serve_forever()
