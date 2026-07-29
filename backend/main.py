from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

app = FastAPI(title="StreamOffline Player API")

# API routes will go here (e.g. /api/download)
@app.get("/api/health")
def health_check():
    return {"status": "ok"}

# Serve the static files from the React build
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # Serve index.html for all other routes to let React Router handle routing
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
else:
    @app.get("/{full_path:path}")
    async def missing_frontend(full_path: str):
        return {"error": "Frontend build not found. Please run 'npm run build' in the frontend directory."}
