import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { saveToOPFS } from '@/lib/storage'
import { db } from '@/lib/db'
import { Download, Search, CheckCircle, Loader2, Music, Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'

function App() {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  
  // Reactively fetch all downloaded tracks from Dexie IndexedDB
  const tracks = useLiveQuery(() => db.tracks.orderBy('addedAt').reverse().toArray())

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return

    setStatus('downloading')
    setErrorMessage('')

    try {
      // Allow dev server to talk to local backend on port 8000 if needed
      // (Assuming the user runs Vite on 5173 and backend on 8000 for testing, 
      // or just /api/download if running behind proxy/built)
      const apiEndpoint = import.meta.env.DEV ? 'http://127.0.0.1:8000/api/download' : '/api/download'
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.detail || 'Download failed on the server.')
      }

      // 1. Try X-Track-Title first (our custom header)
      let title = response.headers.get('X-Track-Title')
      let filename = title ? `${title}.mp3` : `track_${Date.now()}.mp3`

      // 2. Fallback to Content-Disposition if X-Track-Title is missing
      if (!title) {
        const contentDisposition = response.headers.get('Content-Disposition')
        if (contentDisposition) {
          if (contentDisposition.includes('filename*=')) {
            // Parses: filename*=utf-8''My%20Song.mp3
            filename = decodeURIComponent(contentDisposition.split("filename*=utf-8''")[1].split(';')[0])
            title = filename.replace('.mp3', '')
          } else {
            // Parses: filename="My Song.mp3"
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

      // Stream to OPFS
      await saveToOPFS(response.body, filename)

      // Save metadata
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

  const handleDelete = async (id: number, filename: string) => {
    try {
      // First delete from DB
      await db.tracks.delete(id)
      // Note: OPFS deletion logic can go here later using storage.ts deleteFromOPFS
    } catch (e) {
      console.error('Failed to delete track', e)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-4 pt-10 space-y-8 pb-20">
      <div className="w-full max-w-md space-y-8">
        
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-primary">StreamOffline</h1>
          <p className="text-muted-foreground">Download and listen to your music anywhere.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add New Track</CardTitle>
            <CardDescription>Paste a YouTube URL to download it to your offline library.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleDownload} className="space-y-4">
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
              <Button 
                type="submit" 
                className="w-full" 
                disabled={status === 'downloading' || !url}
              >
                {status === 'downloading' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Downloading and Normalizing...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Download to OPFS
                  </>
                )}
              </Button>
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
          <h2 className="text-xl font-semibold tracking-tight">Your Library</h2>
          {tracks === undefined ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tracks.length === 0 ? (
            <div className="text-center p-8 border rounded-lg border-dashed text-muted-foreground">
              No tracks downloaded yet.
            </div>
          ) : (
            <div className="space-y-2">
              {tracks.map(track => (
                <div key={track.id} className="flex items-center justify-between p-3 rounded-lg border bg-card text-card-foreground shadow-sm">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="bg-primary/10 p-2 rounded-full flex-shrink-0">
                      <Music className="h-4 w-4 text-primary" />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-medium truncate">{track.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(track.addedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => track.id && handleDelete(track.id, track.opfsFileName)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default App
