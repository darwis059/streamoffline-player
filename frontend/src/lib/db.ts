import Dexie, { type Table } from 'dexie';

export interface Track {
  id?: number;
  title: string;
  originalUrl: string;
  opfsFileName: string;
  addedAt: Date;
  lyricsOffset?: number;
  lyricId?: number;
}

export class StreamOfflineDB extends Dexie {
  tracks!: Table<Track>;

  constructor() {
    super('StreamOfflineDB');
    this.version(1).stores({
      tracks: '++id, title, addedAt' // Primary key and indexed props
    });
  }
}

export const db = new StreamOfflineDB();
