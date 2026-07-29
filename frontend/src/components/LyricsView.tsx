import { useEffect, useState, useRef } from 'react'
import { Loader2, Mic2, Clock, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { parseLRC, type LyricLine } from '@/lib/lyrics'
import { Button } from '@/components/ui/button'
import { db, type Track } from '@/lib/db'

interface LyricsViewProps {
  track: Track
  currentTime: number
}

export function LyricsView({ track, currentTime }: LyricsViewProps) {
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [lyricOptions, setLyricOptions] = useState<any[]>([])
  const [activeOptionIndex, setActiveOptionIndex] = useState(0)
  
  const [status, setStatus] = useState<'loading' | 'found' | 'not_found' | 'error'>('loading')
  const [isSyncMode, setIsSyncMode] = useState(false)
  const [lyricsOffset, setLyricsOffset] = useState(track.lyricsOffset || 0)
  
  const activeLineRef = useRef<HTMLParagraphElement>(null)

  // 1. Fetch Lyrics when Track Title changes
  useEffect(() => {
    let active = true
    setStatus('loading')
    setLyrics([])
    setLyricOptions([])
    setIsSyncMode(false)
    setLyricsOffset(track.lyricsOffset || 0)

    const fetchLyrics = async () => {
      try {
        const cleanTitle = track.title
          .replace(/\[.*?\]|\(.*?\)/g, '')
          .replace(/official video|lyrics|audio/gi, '')
          .trim()

        const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`)
        if (!res.ok) throw new Error('API Error')
        
        const data = await res.json()
        
        if (active && data.length > 0) {
          const matches = data.filter((item: any) => item.syncedLyrics)
          if (matches.length > 0) {
            setLyricOptions(matches)
            
            // Find preferred ID if it exists, otherwise use 0
            const preferredIdx = track.lyricId ? matches.findIndex((m: any) => m.id === track.lyricId) : 0
            const initialIdx = preferredIdx !== -1 ? preferredIdx : 0
            
            setActiveOptionIndex(initialIdx)
            setLyrics(parseLRC(matches[initialIdx].syncedLyrics))
            setStatus('found')
          } else {
            setStatus('not_found')
          }
        } else if (active) {
          setStatus('not_found')
        }
      } catch (e) {
        console.error('Failed to fetch lyrics:', e)
        if (active) setStatus('error')
      }
    }

    const timeout = setTimeout(fetchLyrics, 300)
    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [track.title, track.lyricId, track.lyricsOffset])

  // 2. Find the active line index (accounting for our custom offset)
  let activeIndex = -1
  if (status === 'found' && lyrics.length > 0) {
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime + 0.2 >= lyrics[i].time + lyricsOffset) {
        activeIndex = i
      } else {
        break
      }
    }
  }

  // 3. Auto-scroll to the active line (only if not in sync mode)
  useEffect(() => {
    if (activeLineRef.current && !isSyncMode) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [activeIndex, isSyncMode])

  const handleLineClick = async (line: LyricLine) => {
    if (!isSyncMode || !track.id) return

    // Calculate the new offset required so that this line's time equals currentTime
    const newOffset = currentTime - line.time
    
    // Save to local state
    setLyricsOffset(newOffset)
    setIsSyncMode(false)

    // Save to IndexedDB
    try {
      await db.tracks.update(track.id, { lyricsOffset: newOffset })
    } catch (e) {
      console.error('Failed to save lyrics offset:', e)
    }
  }
  
  const handleOptionChange = async (newIndex: number) => {
    if (!track.id || newIndex < 0 || newIndex >= lyricOptions.length) return
    
    const newOption = lyricOptions[newIndex]
    
    setActiveOptionIndex(newIndex)
    setLyrics(parseLRC(newOption.syncedLyrics))
    setLyricsOffset(0) // Reset custom sync offset when changing versions
    setIsSyncMode(false)
    
    try {
      await db.tracks.update(track.id, { lyricId: newOption.id, lyricsOffset: 0 })
    } catch (e) {
      console.error('Failed to save lyric ID:', e)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mb-4" />
        <p>Searching for lyrics...</p>
      </div>
    )
  }

  if (status === 'not_found' || status === 'error') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground">
        <Mic2 className="h-12 w-12 mb-4 opacity-50" />
        <p>No synced lyrics found for this track.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto w-full px-6 py-24 scroll-smooth relative">
      
      {/* Top Controls */}
      <div className="fixed top-4 right-4 z-20 flex items-center space-x-2">
        
        {lyricOptions.length > 1 && (
          <div className="flex items-center space-x-1 bg-background/50 backdrop-blur-md rounded-full shadow-md p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => handleOptionChange((activeOptionIndex - 1 + lyricOptions.length) % lyricOptions.length)}
              title="Previous Lyric Version"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium text-muted-foreground w-8 text-center tabular-nums">
              {activeOptionIndex + 1}/{lyricOptions.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => handleOptionChange((activeOptionIndex + 1) % lyricOptions.length)}
              title="Next Lyric Version"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Button
          variant={isSyncMode ? 'default' : 'secondary'}
          size="sm"
          onClick={() => setIsSyncMode(!isSyncMode)}
          className={`rounded-full shadow-md backdrop-blur-md transition-all ${isSyncMode ? 'bg-primary text-primary-foreground' : 'bg-background/50 hover:bg-background/80'}`}
        >
          {isSyncMode ? <Check className="h-4 w-4 mr-2" /> : <Clock className="h-4 w-4 mr-2" />}
          {isSyncMode ? 'Cancel Sync' : 'Sync Lyrics'}
        </Button>
      </div>

      <div className="max-w-2xl mx-auto space-y-8 pb-32 pt-8">
        {isSyncMode && (
          <div className="text-center pb-4 text-sm font-medium text-primary animate-pulse">
            Tap the line that is currently playing to sync.
          </div>
        )}

        {lyrics.map((line, index) => {
          const isActive = index === activeIndex
          const isPast = index < activeIndex
          
          return (
            <p
              key={`${index}-${line.time}`}
              ref={isActive ? activeLineRef : null}
              onClick={() => handleLineClick(line)}
              className={`text-center text-2xl md:text-3xl font-bold transition-all duration-300 ${
                isSyncMode ? 'cursor-pointer hover:text-primary hover:scale-105 opacity-70' : ''
              } ${
                !isSyncMode && isActive 
                  ? 'text-primary scale-105' 
                  : !isSyncMode && isPast 
                    ? 'text-muted-foreground/60 scale-100'
                    : !isSyncMode
                      ? 'text-muted-foreground/40 scale-100'
                      : ''
              }`}
            >
              {line.text || '...'}
            </p>
          )
        })}
      </div>
    </div>
  )
}
