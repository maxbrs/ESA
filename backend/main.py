import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse

from backend.routers import profiles, accounts, transactions, notes

app = FastAPI(title="Expense Sharing App")

# ── Auth middleware ────────────────────────────────────────────────────────────
# Protects all /api/* routes (except /api/health which is used by Render's
# health-check monitor, and /api/me which the frontend probes to detect whether
# auth is required at all).
# When API_SECRET is not set (local dev) every request is let through.
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    api_secret = os.environ.get("API_SECRET", "")
    exempt_paths = {"/api/health", "/api/me"}

    if api_secret and request.url.path.startswith("/api/") and request.url.path not in exempt_paths:
        auth_header = request.headers.get("Authorization", "")
        if auth_header != f"Bearer {api_secret}":
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)

    return await call_next(request)


# ── CORS (local dev only — production is same-origin) ─────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routers ────────────────────────────────────────────────────────────────
app.include_router(profiles.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(notes.router, prefix="/api")


@app.get("/api/health")
def health():
    """Always 200 — used by Render's health-check monitor (no auth required)."""
    return {"status": "ok"}


@app.get("/api/me")
def me():
    """Protected probe — the frontend calls this (without a token) to detect
    whether the backend requires authentication.  When API_SECRET is set the
    auth middleware returns 401 before this handler runs; when it is not set
    (local dev) this returns 200 and the frontend skips the auth gate."""
    return {"ok": True}


# ── Serve React frontend ───────────────────────────────────────────────────────
# In production the Dockerfile copies the Vite build output to frontend/dist/.
# During local development this directory does not exist and the Vite dev server
# is used instead (see Makefile / vite.config.ts proxy).
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve static assets directly; fall back to index.html for any other
        path so that React Router's client-side navigation works correctly."""
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
