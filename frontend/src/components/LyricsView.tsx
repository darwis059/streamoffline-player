import { useEffect, useState, useRef } from 'react'
import { Loader2, Mic2 } from 'lucide-react'
import { parseLRC, type LyricLine } from '@/lib/lyrics'

interface LyricsViewProps {
  trackTitle: string
  currentTime: number
}

export function LyricsView({ trackTitle, currentTime }: LyricsViewProps) {
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [status, setStatus] = useState<'loading' | 'found' | 'not_found' | 'error'>('loading')
  const activeLineRef = useRef<HTMLParagraphElement>(null)

  // 1. Fetch Lyrics when Track Title changes
  useEffect(() => {
    let active = true
    setStatus('loading')
    setLyrics([])

    const fetchLyrics = async () => {
      try {
        // Strip out some common noise from titles to improve hit rate
        const cleanTitle = trackTitle
          .replace(/\[.*?\]|\(.*?\)/g, '') // Remove brackets/parentheses content
          .replace(/official video|lyrics|audio/gi, '') // Remove common words
          .trim()

        const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`)
        
        if (!res.ok) throw new Error('API Error')
        
        const data = await res.json()
        
        if (active && data.length > 0) {
          // Find the first result that has syncedLyrics
          const match = data.find((item: any) => item.syncedLyrics)
          
          if (match && match.syncedLyrics) {
            setLyrics(parseLRC(match.syncedLyrics))
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

    // Debounce slightly just in case
    const timeout = setTimeout(fetchLyrics, 300)

    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [trackTitle])

  // 2. Find the active line index
  let activeIndex = -1
  if (status === 'found' && lyrics.length > 0) {
    for (let i = 0; i < lyrics.length; i++) {
      // Add a tiny 200ms offset because lyrics often appear slightly after the word starts
      if (currentTime + 0.2 >= lyrics[i].time) {
        activeIndex = i
      } else {
        break
      }
    }
  }

  // 3. Auto-scroll to the active line
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [activeIndex])

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
    <div className="flex-1 overflow-y-auto w-full px-6 py-24 scroll-smooth">
      <div className="max-w-2xl mx-auto space-y-8 pb-32">
        {lyrics.map((line, index) => {
          const isActive = index === activeIndex
          const isPast = index < activeIndex
          
          return (
            <p
              key={`${index}-${line.time}`}
              ref={isActive ? activeLineRef : null}
              className={`text-2xl md:text-3xl font-bold transition-all duration-300 ${
                isActive 
                  ? 'text-primary scale-105' 
                  : isPast 
                    ? 'text-muted-foreground/60 scale-100'
                    : 'text-muted-foreground/40 scale-100'
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
