# ── Stage 1: build the React frontend ────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy the built React app so FastAPI can serve it as static files
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Render injects $PORT at runtime; fall back to 8000 for local Docker use
CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
