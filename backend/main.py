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
import urllib.request
import urllib.parse
import json
import re
from mutagen.easyid3 import EasyID3
from mutagen.id3 import ID3NoHeaderError

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

def fetch_musicbrainz(query: str):
    try:
        clean_query = re.sub(r'\[.*?\]|\(.*?\)', '', query)
        clean_query = re.sub(r'(?i)official video|lyrics|audio|music video', '', clean_query)
        clean_query = clean_query.strip()
        
        parts = clean_query.split('-')
        if len(parts) == 2:
            artist = parts[0].strip()
            recording = parts[1].strip()
            mb_query = f'artist:"{artist}" AND recording:"{recording}"'
        else:
            mb_query = clean_query
            
        url = f"https://musicbrainz.org/ws/2/recording/?query={urllib.parse.quote(mb_query)}&fmt=json"
        
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'StreamOfflinePlayer/1.0 ( my@email.com )'}
        )
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data.get('recordings') and len(data['recordings']) > 0:
                best_match = data['recordings'][0]
                
                title = best_match.get('title')
                artist_name = best_match.get('artist-credit', [{}])[0].get('name') if best_match.get('artist-credit') else None
                album = None
                if best_match.get('releases') and len(best_match['releases']) > 0:
                    album = best_match['releases'][0].get('title')
                
                return {
                    'title': title,
                    'artist': artist_name,
                    'album': album
                }
    except Exception as e:
        print(f"MusicBrainz API error: {e}")
    return None

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
            
            raw_title = info.get('title', 'audio')
            safe_title = raw_title.replace('/', '_').replace('\\', '_')

            # Fetch metadata from MusicBrainz and embed it
            mb_data = fetch_musicbrainz(raw_title)
            if mb_data:
                try:
                    try:
                        audio_tags = EasyID3(mp3_file)
                    except ID3NoHeaderError:
                        audio_tags = EasyID3()
                    
                    if mb_data['title']:
                        audio_tags['title'] = mb_data['title']
                        # Also update safe_title so the downloaded file name looks clean
                        safe_title = mb_data['title'].replace('/', '_').replace('\\', '_')
                    if mb_data['artist']:
                        audio_tags['artist'] = mb_data['artist']
                        if mb_data['title']:
                            safe_title = f"{mb_data['artist']} - {mb_data['title']}".replace('/', '_').replace('\\', '_')
                    if mb_data['album']:
                        audio_tags['album'] = mb_data['album']
                        
                    audio_tags.save(mp3_file)
                except Exception as e:
                    print(f"Failed to embed ID3 tags: {e}")
            
            return FileResponse(
                path=mp3_file, 
                media_type='audio/mpeg', 
                filename=f"{safe_title}.mp3",
                headers={"X-Track-Title": safe_title.encode('latin-1', 'ignore').decode('latin-1')},
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
