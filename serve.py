"""Serveur local de développement : python3 serve.py  (puis http://localhost:8000)

Identique à `python3 -m http.server`, mais demande au navigateur de ne rien
garder en cache : chaque rechargement de page prend la dernière version des
fichiers que tu modifies. Port personnalisable : python3 serve.py 8001
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=str(Path(__file__).parent))
    print(f"Site disponible sur http://localhost:{port}  (Ctrl+C pour arrêter)")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
