.PHONY: dev backend frontend install

dev:
	@trap 'kill 0' SIGINT; \
	(.venv/bin/uvicorn backend.main:app --reload --port 8000) & \
	(cd frontend && npm run dev) & \
	wait

backend:
	.venv/bin/uvicorn backend.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

install:
	cd frontend && npm install
	cd backend && pip install -r requirements.txt
