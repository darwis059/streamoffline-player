import { useEffect, useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { getOpfsAudioUrl } from '@/lib/storage'
import type { Track } from '@/lib/db'

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
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg pb-safe">
      <div className="max-w-md mx-auto p-4 flex flex-col space-y-3">
        
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

        <div className="flex justify-between items-center px-1">
          <div className="overflow-hidden">
            <h3 className="font-semibold text-sm truncate">{track.title}</h3>
            <p className="text-xs text-muted-foreground">StreamOffline</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center space-x-3 text-xs text-muted-foreground">
          <span className="w-8 text-right">{formatTime(currentTime)}</span>
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={1}
            onValueChange={handleSeek}
            className="flex-1"
          />
          <span className="w-8">{formatTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="flex justify-center items-center space-x-6">
          <Button variant="ghost" size="icon" onClick={onPrevious}>
            <SkipBack className="h-6 w-6" />
          </Button>
          
          <Button 
            variant="default" 
            size="icon" 
            className="h-12 w-12 rounded-full shadow-md"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6 ml-1" />
            )}
          </Button>

          <Button variant="ghost" size="icon" onClick={onNext}>
            <SkipForward className="h-6 w-6" />
          </Button>
        </div>

      </div>
    </div>
  )
}
