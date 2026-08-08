#!/usr/bin/env python3
"""Lokal utviklingsserver for Tommestokk1.

Serverer filer som vanlig, men svarer med index.html for ukjente stier —
samme oppførsel som _redirects gir på Cloudflare Pages. Uten dette ville
/terrasse gi 404 lokalt.

    python3 serve.py          → http://localhost:5173
    python3 serve.py 8080     → annen port
"""
import http.server, os, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class SPA(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        sti = self.path.split("?", 1)[0].lstrip("/")
        if sti and not os.path.exists(sti):
            self.path = "/index.html"          # ukjent sti → la nettleseren rute
        return super().do_GET()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), SPA) as srv:
    print(f"Tommestokk1 kjører på http://localhost:{PORT}  (Ctrl+C for å stoppe)")
    srv.serve_forever()
