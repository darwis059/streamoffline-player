export interface LyricLine {
  time: number // in seconds
  text: string
}

export function parseLRC(lrc: string): LyricLine[] {
  const lines = lrc.split('\n')
  const parsedLyrics: LyricLine[] = []

  // LRC timestamp format: [mm:ss.xx]
  const timeRegex = /\[(\d{2}):(\d{2}\.\d{2,3})\]/

  for (const line of lines) {
    const match = line.match(timeRegex)
    if (match) {
      const minutes = parseInt(match[1], 10)
      const seconds = parseFloat(match[2])
      const timeInSeconds = minutes * 60 + seconds
      
      // Extract text by removing the timestamp part
      const text = line.replace(timeRegex, '').trim()
      
      parsedLyrics.push({
        time: timeInSeconds,
        text
      })
    }
  }

  // Sort by time just in case they are out of order
  return parsedLyrics.sort((a, b) => a.time - b.time)
}
