from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.background import BackgroundTask
import os
import shutil
import tempfile
import yt_dlp

app = FastAPI(title="StreamOffline Player API")

# Allow the frontend to access headers during local dev cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Track-Title"],
)

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
    is_verbose = os.environ.get('YT_DLP_VERBOSE', 'false').lower() == 'true'
    
    # yt-dlp configuration to download best audio, convert to 192kbps MP3,
    # apply loudnorm filter, and embed ID3 tags/thumbnail
    ydl_opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio/best',
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
        'postprocessor_args': {
            'ExtractAudio': ['-af', 'loudnorm']
        },
        'writethumbnail': True,
        'quiet': not is_verbose,
        'no_warnings': not is_verbose,
    }

    if is_verbose:
        ydl_opts['verbose'] = True

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
                headers={"X-Track-Title": safe_title},
                background=BackgroundTask(cleanup_temp_dir, temp_dir)
            )
            
    except Exception as e:
        cleanup_temp_dir(temp_dir)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/formats")
async def get_formats(request: DownloadRequest):
    url = request.url
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    cookie_path = os.environ.get('YT_DLP_COOKIES', '/app/cookies.txt')
    is_verbose = os.environ.get('YT_DLP_VERBOSE', 'false').lower() == 'true'
    
    ydl_opts = {
        'quiet': not is_verbose,
        'no_warnings': not is_verbose,
        'ignoreerrors': True,
    }

    if is_verbose:
        ydl_opts['verbose'] = True

    # Debug info to pass back to the client
    cookie_status = "Not Found"

    if os.path.exists(cookie_path):
        if os.path.isfile(cookie_path):
            ydl_opts['cookiefile'] = cookie_path
            cookie_status = f"File found and used at {cookie_path}"
        elif os.path.isdir(cookie_path):
            cookie_status = f"ERROR: Path {cookie_path} is a directory! Your Docker bind mount is incorrect."
    else:
        cookie_status = f"ERROR: Path {cookie_path} does not exist."

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # process=False prevents it from throwing the 'Requested format is not available' error
            info = ydl.extract_info(url, download=False, process=False)
            
            if not info:
                return {"error": "yt-dlp returned None. Likely blocked.", "cookie_status": cookie_status}
                
            formats = info.get('formats', [])
            
            simplified_formats = []
            for f in formats:
                simplified_formats.append({
                    'format_id': f.get('format_id'),
                    'ext': f.get('ext'),
                    'resolution': f.get('resolution', 'audio only' if f.get('vcodec') == 'none' else 'unknown'),
                    'vcodec': f.get('vcodec'),
                    'acodec': f.get('acodec'),
                    'filesize': f.get('filesize'),
                    'format_note': f.get('format_note')
                })
            
            return {
                "cookie_status": cookie_status,
                "total_formats_found": len(simplified_formats),
                "formats": simplified_formats,
                "raw_info_keys": list(info.keys())
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{str(e)} | Cookie status: {cookie_status}")

# Serve the static files from the React build
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # Serve actual file if it exists (e.g. /favicon.svg), else fallback to index.html for React Router
        clean_path = full_path.lstrip('/')
        file_path = os.path.join(STATIC_DIR, clean_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
else:
    @app.get("/{full_path:path}")
    async def missing_frontend(full_path: str):
        return {"error": "Frontend build not found. Please run 'npm run build' in the frontend directory."}
