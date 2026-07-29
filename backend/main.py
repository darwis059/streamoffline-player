from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask
import os
import shutil
import tempfile
import yt_dlp

app = FastAPI(title="StreamOffline Player API")

class DownloadRequest(BaseModel):
    url: str

def cleanup_temp_dir(temp_dir: str):
    """Deletes the temporary directory after the file is streamed."""
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)

@app.post("/api/download")
async def download_audio(request: DownloadRequest):
    url = request.url
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    temp_dir = tempfile.mkdtemp()
    
    cookie_path = os.environ.get('YT_DLP_COOKIES', '/app/cookies.txt')
    
    # yt-dlp configuration to download best audio, convert to 192kbps MP3,
    # apply loudnorm filter, and embed ID3 tags/thumbnail
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(temp_dir, '%(title)s.%(ext)s'),
        'postprocessors': [
            {
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            },
            {
                'key': 'FFmpegMetadata',
                'add_metadata': True,
            },
            {
                'key': 'EmbedThumbnail',
                'already_have_thumbnail': False,
            }
        ],
        'postprocessor_args': [
            '-af', 'loudnorm'
        ],
        'writethumbnail': True,
        'quiet': True,
        'no_warnings': True,
    }

    if os.path.exists(cookie_path):
        ydl_opts['cookiefile'] = cookie_path

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
            # Find the generated mp3 file in the temporary directory
            mp3_file = None
            for filename in os.listdir(temp_dir):
                if filename.endswith(".mp3"):
                    mp3_file = os.path.join(temp_dir, filename)
                    break
                    
            if not mp3_file:
                raise HTTPException(status_code=500, detail="Failed to convert audio to MP3")
            
            safe_title = info.get('title', 'audio').replace('/', '_').replace('\\', '_')
            
            return FileResponse(
                path=mp3_file, 
                media_type='audio/mpeg', 
                filename=f"{safe_title}.mp3",
                background=BackgroundTask(cleanup_temp_dir, temp_dir)
            )
            
    except Exception as e:
        cleanup_temp_dir(temp_dir)
        raise HTTPException(status_code=500, detail=str(e))

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
