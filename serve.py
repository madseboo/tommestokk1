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
    """Etterligner Cloudflare Workers sin håndtering av statiske filer:
    /terrasse serveres fra terrasse.html, og ukjente stier faller tilbake
    til index.html i stedet for å gi 404."""

    def do_GET(self):
        sti = self.path.split("?", 1)[0].lstrip("/")
        if sti and not os.path.exists(sti):
            if os.path.exists(sti + ".html"):
                self.path = "/" + sti + ".html"     # /terrasse → terrasse.html
            else:
                self.path = "/index.html"           # ukjent sti → la appen rute
        return super().do_GET()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), SPA) as srv:
    print(f"Tommestokk1 kjører på http://localhost:{PORT}  (Ctrl+C for å stoppe)")
    srv.serve_forever()
