import { useEffect, useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { getOpfsAudioUrl } from '@/lib/storage'
import type { Track } from '@/lib/db'
import { LyricsView } from '@/components/LyricsView'

interface AudioPlayerProps {
  track: Track
  onNext: () => void
  onPrevious: () => void
}

export function AudioPlayer({ track, onNext, onPrevious }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  // 1. Manage the OPFS Blob URL lifecycle
  useEffect(() => {
    let active = true
    let url = ''

    const loadAudio = async () => {
      try {
        url = await getOpfsAudioUrl(track.opfsFileName)
        if (active) {
          setAudioUrl(url)
          setIsPlaying(true) // Autoplay when track changes
        }
      } catch (err) {
        console.error('Failed to load OPFS audio', err)
      }
    }

    loadAudio()

    return () => {
      active = false
      if (url) URL.revokeObjectURL(url) // Crucial to prevent memory leaks!
    }
  }, [track.opfsFileName])

  // 2. Playback Effects (Auto-play when URL changes)
  useEffect(() => {
    if (audioRef.current && audioUrl) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error("Playback failed:", e))
      } else {
        audioRef.current.pause()
      }
    }
  }, [audioUrl, isPlaying])

  // 3. Media Session API (iOS Lock Screen Controls)
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: 'StreamOffline',
        album: 'Offline Library',
        artwork: [
          { src: '/apple-touch-icon.png', sizes: '192x192', type: 'image/png' },
          { src: '/apple-touch-icon.png', sizes: '512x512', type: 'image/png' }
        ]
      })

      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true))
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false))
      navigator.mediaSession.setActionHandler('previoustrack', onPrevious)
      navigator.mediaSession.setActionHandler('nexttrack', onNext)
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (audioRef.current && details.seekTime !== undefined) {
          audioRef.current.currentTime = details.seekTime
        }
      })
    }

    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null)
        navigator.mediaSession.setActionHandler('pause', null)
        navigator.mediaSession.setActionHandler('previoustrack', null)
        navigator.mediaSession.setActionHandler('nexttrack', null)
        navigator.mediaSession.setActionHandler('seekto', null)
      }
    }
  }, [track, onNext, onPrevious])

  // Sync Media Session state with our playing state
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    }
  }, [isPlaying])


  // Handlers for Audio HTML events
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleEnded = () => {
    onNext()
  }

  const handleSeek = (value: number[]) => {
    const newTime = value[0]
    if (audioRef.current) {
      audioRef.current.currentTime = newTime
    }
    setCurrentTime(newTime)
  }

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div 
      className={`fixed left-0 right-0 bg-background border-t shadow-[0_-10px_40px_rgba(0,0,0,0.1)] transition-all duration-300 z-50 flex flex-col ${
        isExpanded ? 'top-0 bottom-0' : 'bottom-0 pb-safe'
      }`}
    >
      {/* Hidden Audio Element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {/* Expanded View Content (Lyrics) */}
      {isExpanded && (
        <div className="flex-1 flex flex-col min-h-0 relative bg-gradient-to-b from-background to-muted/20">
          <LyricsView track={track} currentTime={currentTime} />
        </div>
      )}

      {/* Player Controls (Always visible) */}
      <div className={`w-full max-w-2xl mx-auto p-4 flex flex-col space-y-3 ${isExpanded ? 'bg-background/80 backdrop-blur-xl border-t' : ''}`}>
        
        <div className="flex justify-between items-center px-1">
          <div className="overflow-hidden flex-1 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
            <h3 className={`font-semibold truncate ${isExpanded ? 'text-lg text-primary' : 'text-sm'}`}>{track.title}</h3>
            <p className="text-xs text-muted-foreground">StreamOffline</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            )}
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center space-x-3 text-xs text-muted-foreground">
          <span className="w-8 text-right font-medium">{formatTime(currentTime)}</span>
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={1}
            onValueChange={handleSeek}
            className="flex-1"
          />
          <span className="w-8 font-medium">{formatTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="flex justify-center items-center space-x-6 pb-2">
          <Button variant="ghost" size="icon" onClick={onPrevious} className="hover:text-primary transition-colors">
            <SkipBack className="h-6 w-6 fill-current" />
          </Button>
          
          <Button 
            variant="default" 
            size="icon" 
            className="h-14 w-14 rounded-full shadow-lg hover:scale-105 transition-transform"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 fill-current" />
            ) : (
              <Play className="h-6 w-6 ml-1 fill-current" />
            )}
          </Button>

          <Button variant="ghost" size="icon" onClick={onNext} className="hover:text-primary transition-colors">
            <SkipForward className="h-6 w-6 fill-current" />
          </Button>
        </div>

      </div>
    </div>
  )
}
