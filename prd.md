Product Requirements Document (PRD)

Product Name: StreamOffline Player (Placeholder)
Platform: Progressive Web App (PWA) optimized for iOS (Safari)
Environment: Full-stack, Single-Container Dockerized Deployment

1. Product Overview

A web-based music application designed to operate as a native-like PWA on iOS devices. The core value proposition allows users to search for music on YouTube, download the audio directly to their device via a backend service, organize it into playlists, and play it offline in the background with synced lyrics.

2. Target Platform & Constraints

Primary OS: iOS (iPhone/iPad).

Browser Engine: WebKit (Safari).

Capabilities Required: Background audio playback, lock-screen media controls, persistent offline storage, network installation (Add to Home Screen).

Share Constraints: iOS does not support the Web Share Target API. Receiving shared URLs from the YouTube app will be handled via an iOS Shortcut workaround.

3. Tech Stack

Frontend: React, styled with Tailwind CSS and shadcn/ui components for a modern, accessible, and native-feeling mobile interface.

Backend: Lightweight Python (FastAPI recommended) to handle processing and serve the compiled React frontend.

Audio Processing: yt-dlp for downloading and ffmpeg for MP3 conversion.

Storage: Origin Private File System (OPFS) for high-performance, local frontend audio storage.

Infrastructure: Single Docker image utilizing a multi-stage build.

Lyrics API: LRCLIB (free external API) for fetching synced/static lyrics.

4. Core Features & Requirements

4.1. Music Discovery & Downloading

Search Interface: Users can input a search query or a direct YouTube URL. The frontend will display video results (Title, Thumbnail, Duration, Channel).

iOS Share Sheet Integration:

The frontend will parse incoming query parameters on load (e.g., ?share_url=<youtube_link>).

If detected, the app will automatically populate the search bar and initiate the search/download flow.

Note: Users will be provided with an easily installable Apple Shortcut that accepts YouTube URLs from the native Share Sheet and redirects to this PWA endpoint.

Backend Processing Flow:

Frontend sends the YouTube ID/URL to the Python backend API (/api/download).

Backend executes yt-dlp to download the best audio stream.

Backend uses ffmpeg to convert the stream to a high-quality MP3.

Backend applies Audio Volume Normalization (using ffmpeg loudnorm filter) so all tracks play at a consistent volume.

Backend attaches ID3 tags (Title, Artist, Album Art) to the MP3 file.

Backend streams the processed MP3 back to the frontend.

Frontend Save (OPFS): The React frontend receives the MP3 blob and writes it directly to the browser's Origin Private File System (OPFS) for permanent offline access.

YouTube Playlist Downloading: Users can paste a YouTube Playlist URL. The backend will fetch the video IDs and the frontend will present a checklist for the user to select multiple songs to download.

4.2. Library & Playlist Management

Local Database: Use IndexedDB (via a wrapper like Dexie.js) to store metadata (Track ID, Title, Artist, Duration, OPFS file reference) for fast library rendering.

Library UI: A centralized view of all downloaded tracks.

Playlists: Users can create, edit, and delete custom playlists.

Queue Management: Ability to view the "Up Next" queue, reorder tracks, and toggle shuffle/repeat modes.

Library Backup & Restore: A utility allowing users to export their entire IndexedDB metadata and OPFS MP3 files as a single ZIP archive, and restore from a ZIP archive, ensuring data permanence across device migrations.

4.3. Audio Playback & iOS Background Support

Native Audio: Use the HTML5 <audio> element sourced from the OPFS file handle.

Background Playback: The app must continue playing audio when the screen is locked or the user switches apps.

Media Session API: Implement navigator.mediaSession to display the track title, artist, and album art on the iOS lock screen and Control Center.

Sleep Timer: Users can set a countdown timer (e.g., 15m, 30m, "End of track") that will pause the audio playback when it reaches zero.

4.4. Dynamic UI & Lyrics Integration

Dynamic UI Theming: The player UI background and accents will automatically shift colors based on the dominant colors extracted from the currently playing track's album art (similar to Apple Music).

Lyrics Fetching: When a track begins playing, query the LRCLIB API using track metadata.

Display Modes:

Synced: Highlight the current line as the audio progresses based on timestamps.

Static: Display a scrollable text view if no timestamps are available.

5. System Architecture (Multi-Stage Docker)

The application will be deployed using a single Dockerfile with multi-stage builds:

Stage 1 (Node.js/Vite): Installs React dependencies and compiles the frontend into static assets (dist folder).

Stage 2 (Python): Contains yt-dlp, ffmpeg, and FastAPI. It copies the dist folder from Stage 1.

Routing: FastAPI handles all /api/* routes. A wildcard route (/*) catches all other traffic and serves the React index.html, allowing React Router to handle frontend navigation.

6. Implementation Phases

Phase 1: Foundation. Scaffold the multi-stage Dockerfile. Setup FastAPI to serve the compiled React app.

Phase 2: Backend Audio Pipeline. Implement search endpoints, YouTube Playlist parsing, and the yt-dlp + ffmpeg (with normalization) download pipeline.

Phase 3: Frontend Storage & Sync. Implement React UI with shadcn/ui. Connect downloading to OPFS and IndexedDB. Implement Backup/Restore ZIP logic.

Phase 4: Player & iOS Native Features. Implement HTML5 audio, Media Session API, Dynamic UI theming, Sleep Timer, and LRCLIB lyrics synchronization. Configure query parameter routing for the iOS Shortcut share integration.