import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { saveToOPFS, deleteFromOPFS } from '@/lib/storage'
import { db } from '@/lib/db'
import { Download, Search, CheckCircle, Loader2, Music, Trash2, Play, ClipboardPaste, Shuffle } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AudioPlayer } from '@/components/AudioPlayer'

function App() {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)

  // Player state
  const [currentTrackId, setCurrentTrackId] = useState<number | null>(null)
  const [isShuffle, setIsShuffle] = useState<boolean>(() => {
    try {
      return localStorage.getItem('streamoffline_shuffle') === 'true'
    } catch {
      return false
    }
  })
  const [shuffleHistory, setShuffleHistory] = useState<number[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)

  useEffect(() => {
    try {
      localStorage.setItem('streamoffline_shuffle', String(isShuffle))
    } catch (e) {
      console.error('Failed to save shuffle setting', e)
    }
  }, [isShuffle])
  
  // Library filter state
  const [searchQuery, setSearchQuery] = useState('')

  // Reactively fetch all downloaded tracks from Dexie IndexedDB
  const tracks = useLiveQuery(() => db.tracks.orderBy('addedAt').reverse().toArray())
  
  // Filtered tracks
  const filteredTracks = tracks?.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return

    setStatus('downloading')
    setErrorMessage('')
    setDownloadProgress(null)

    try {
      const apiEndpoint = import.meta.env.DEV ? 'http://127.0.0.1:8001/api/download' : '/api/download'

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.detail || 'Download failed on the server.')
      }

      let title = response.headers.get('X-Track-Title')
      let filename = title ? `${title}.mp3` : `track_${Date.now()}.mp3`

      if (!title) {
        const contentDisposition = response.headers.get('Content-Disposition')
        if (contentDisposition) {
          if (contentDisposition.includes('filename*=')) {
            filename = decodeURIComponent(contentDisposition.split("filename*=utf-8''")[1].split(';')[0])
            title = filename.replace('.mp3', '')
          } else {
            const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/)
            if (filenameMatch && filenameMatch.length > 1) {
              filename = filenameMatch[1]
              title = filename.replace('.mp3', '')
            }
          }
        }
      }

      if (!title) title = 'Unknown Track'

      if (!response.body) {
        throw new Error('No response body returned from server.')
      }

      const contentLength = response.headers.get('Content-Length')
      const total = parseInt(contentLength || '0', 10)
      let loaded = 0

      const reader = response.body.getReader()
      const stream = new ReadableStream({
        async start(controller) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            loaded += value.length
            if (total) {
              setDownloadProgress((loaded / total) * 100)
            }
            controller.enqueue(value)
          }
          controller.close()
          reader.releaseLock()
        }
      })

      await saveToOPFS(stream, filename)

      await db.tracks.add({
        title,
        originalUrl: url,
        opfsFileName: filename,
        addedAt: new Date()
      })

      setStatus('success')
      setUrl('')
      setTimeout(() => setStatus('idle'), 5000)

    } catch (err: any) {
      console.error('Download error:', err)
      setErrorMessage(err.message || 'An unexpected error occurred.')
      setStatus('error')
    }
  }

  const handlePasteAndDownload = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text || !text.startsWith('http')) {
        alert('No valid URL found in clipboard.')
        return
      }
      setUrl(text)
      
      // Wait for state update to flush
      setTimeout(() => {
         const formEvent = new Event('submit', { cancelable: true, bubbles: true });
         document.getElementById('download-form')?.dispatchEvent(formEvent);
      }, 50)
      
    } catch (e) {
      alert('Failed to read from clipboard. Please allow clipboard permissions.')
    }
  }

  const handleDelete = async (id: number, filename: string) => {
    try {
      await db.tracks.delete(id)
      await deleteFromOPFS(filename)
      // Reset player if currently playing track was deleted
      if (currentTrackId === id) {
        setCurrentTrackId(null)
      }
      setShuffleHistory(prev => prev.filter(tId => tId !== id))
    } catch (e) {
      console.error('Failed to delete track', e)
    }
  }

  // Player controls & Shuffle logic
  const handlePlayTrack = (trackId: number) => {
    setCurrentTrackId(trackId)
    setShuffleHistory(prev => {
      const nextHistory = historyIndex >= 0 ? prev.slice(0, historyIndex + 1) : []
      return [...nextHistory, trackId]
    })
    setHistoryIndex(prev => (prev >= 0 ? prev + 1 : 0))
  }

  const handleToggleShuffle = () => {
    setIsShuffle(prev => !prev)
  }

  const handleShufflePlay = () => {
    const pool = (filteredTracks && filteredTracks.length > 0) ? filteredTracks : tracks
    if (!pool || pool.length === 0) return

    setIsShuffle(true)

    let nextTrack = pool[Math.floor(Math.random() * pool.length)]
    if (pool.length > 1 && nextTrack.id === currentTrackId) {
      const candidates = pool.filter(t => t.id !== currentTrackId)
      nextTrack = candidates[Math.floor(Math.random() * candidates.length)]
    }

    if (nextTrack?.id) {
      handlePlayTrack(nextTrack.id)
    }
  }

  const handleNext = () => {
    if (!tracks || tracks.length === 0 || currentTrackId === null) return

    if (isShuffle) {
      // 1. If user previously navigated backward, move forward through existing history
      if (historyIndex >= 0 && historyIndex < shuffleHistory.length - 1) {
        const nextId = shuffleHistory[historyIndex + 1]
        if (tracks.some(t => t.id === nextId)) {
          setHistoryIndex(historyIndex + 1)
          setCurrentTrackId(nextId)
          return
        }
      }

      // 2. Otherwise pick a new random track avoiding immediate repeat
      if (tracks.length > 1) {
        const recentWindow = shuffleHistory.slice(-Math.min(tracks.length - 1, 10))
        let candidates = tracks.filter(t => t.id !== currentTrackId && !recentWindow.includes(t.id!))
        if (candidates.length === 0) {
          candidates = tracks.filter(t => t.id !== currentTrackId)
        }
        const randomTrack = candidates[Math.floor(Math.random() * candidates.length)]
        if (randomTrack?.id) {
          handlePlayTrack(randomTrack.id)
        }
        return
      }
    }

    // Sequential next
    const currentIndex = tracks.findIndex(t => t.id === currentTrackId)
    if (currentIndex !== -1) {
      const nextIndex = (currentIndex + 1) % tracks.length
      const nextTrack = tracks[nextIndex]
      if (nextTrack?.id) {
        handlePlayTrack(nextTrack.id)
      }
    }
  }

  const handlePrevious = () => {
    if (!tracks || tracks.length === 0 || currentTrackId === null) return

    if (isShuffle) {
      // 1. If we have backward history, go back to previously played track
      if (historyIndex > 0) {
        const prevId = shuffleHistory[historyIndex - 1]
        if (tracks.some(t => t.id === prevId)) {
          setHistoryIndex(historyIndex - 1)
          setCurrentTrackId(prevId)
          return
        }
      }

      // 2. If no history, pick random other track if available
      const others = tracks.filter(t => t.id !== currentTrackId)
      if (others.length > 0) {
        const randomTrack = others[Math.floor(Math.random() * others.length)]
        if (randomTrack?.id) {
          handlePlayTrack(randomTrack.id)
        }
        return
      }
    }

    // Sequential previous
    const currentIndex = tracks.findIndex(t => t.id === currentTrackId)
    if (currentIndex !== -1) {
      const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length
      const prevTrack = tracks[prevIndex]
      if (prevTrack?.id) {
        handlePlayTrack(prevTrack.id)
      }
    }
  }

  const currentTrack = tracks?.find(t => t.id === currentTrackId)

  return (
    <div className={`min-h-screen bg-background flex flex-col items-center p-4 pt-10 space-y-8 ${currentTrackId !== null ? 'pb-[40vh]' : 'pb-20'}`}>
      <div className="w-full max-w-md space-y-8">

        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-primary">StreamOffline</h1>
          <p className="text-muted-foreground">Built with ❤️ for my Erika.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add New Track</CardTitle>
            <CardDescription>Paste a YouTube URL to download it to your offline library.</CardDescription>
          </CardHeader>
          <CardContent>
            <form id="download-form" onSubmit={handleDownload} className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="https://youtube.com/watch?v=..."
                  className="pl-9"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={status === 'downloading'}
                  required
                />
              </div>
              
              {status === 'downloading' && (
                <div className="flex items-center space-x-2 px-1">
                  <div className="flex-1 h-[1.5px] bg-secondary overflow-hidden rounded-full">
                    <div 
                      className="h-full bg-primary transition-all duration-300 ease-out"
                      style={{ width: `${downloadProgress || (downloadProgress === 0 ? 0 : 10)}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
                    {downloadProgress !== null ? `${Math.round(downloadProgress)}%` : '...'}
                  </span>
                </div>
              )}

              <div className="flex space-x-2">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={status === 'downloading' || !url}
                >
                  {status === 'downloading' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Downloading ...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handlePasteAndDownload}
                  disabled={status === 'downloading'}
                  title="Paste URL and Download"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
              </div>
            </form>

            {status === 'error' && (
              <div className="mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20">
                {errorMessage}
              </div>
            )}
            {status === 'success' && (
              <div className="mt-4 p-3 bg-green-500/10 text-green-600 dark:text-green-400 text-sm rounded-md border border-green-500/20 flex items-center">
                <CheckCircle className="mr-2 h-4 w-4" />
                Successfully added track to library!
              </div>
            )}
          </CardContent>
        </Card>

        {/* Library UI Indicator */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Your Library</h2>
            <Button
              variant={isShuffle ? "default" : "outline"}
              size="sm"
              onClick={handleShufflePlay}
              disabled={!tracks || tracks.length === 0}
              className="h-8 px-3 text-xs font-medium gap-1.5 transition-all shadow-sm"
              title={tracks && tracks.length > 0 ? (isShuffle ? "Shuffle is ON - play random track" : "Shuffle play library") : "No tracks in library to shuffle"}
            >
              <Shuffle className="h-3.5 w-3.5" />
              <span>Shuffle</span>
            </Button>
          </div>
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Filter tracks..."
              className="pl-8 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {tracks === undefined ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tracks.length === 0 ? (
            <div className="text-center p-8 border rounded-lg border-dashed text-muted-foreground">
              No tracks downloaded yet.
            </div>
          ) : filteredTracks?.length === 0 ? (
            <div className="text-center p-8 border rounded-lg border-dashed text-muted-foreground">
              No tracks found matching "{searchQuery}".
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTracks?.map((track) => {
                const isPlaying = currentTrackId === track.id
                
                return (
                  <div key={track.id} className="flex items-center justify-between p-3 rounded-lg border bg-card text-card-foreground shadow-sm group">
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="bg-primary/10 hover:bg-primary/20 p-2 rounded-full flex-shrink-0"
                        onClick={() => handlePlayTrack(track.id!)}
                      >
                        {isPlaying ? (
                          <Music className="h-4 w-4 text-primary animate-pulse" />
                        ) : (
                          <Play className="h-4 w-4 text-primary" />
                        )}
                      </Button>
                      <div className="truncate cursor-pointer" onClick={() => handlePlayTrack(track.id!)}>
                        <p className={`text-sm font-medium truncate ${isPlaying ? 'text-primary' : ''}`}>
                          {track.title}
                        </p>
                        <p className="text-xs text-muted-foreground">{new Date(track.addedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${track.title}"?`)) {
                          track.id && handleDelete(track.id, track.opfsFileName)
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* Global Audio Player */}
      {currentTrackId !== null && currentTrack && (
        <AudioPlayer
          track={currentTrack}
          onNext={handleNext}
          onPrevious={handlePrevious}
          isShuffle={isShuffle}
          onToggleShuffle={handleToggleShuffle}
        />
      )}
    </div>
  )
}

export default App
