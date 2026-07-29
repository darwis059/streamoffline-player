/**
 * Origin Private File System (OPFS) Storage Utility
 * 
 * OPFS is a storage endpoint provided by the browser that allows web applications
 * to store files locally with high performance. Unlike IndexedDB, OPFS provides a 
 * true file system interface and is heavily optimized for reading/writing large 
 * binary files (like audio streams).
 * 
 * Security Note:
 * Files stored in OPFS are heavily sandboxed. They are completely hidden from the 
 * user's OS file manager. A user cannot open their "Files" app on iOS or Windows 
 * Explorer and see these files. They belong entirely to this specific website origin.
 */

/**
 * Saves a ReadableStream (e.g., from a fetch response) directly into OPFS.
 * 
 * @param responseBody - The stream to read from (e.g. response.body)
 * @param filename - The exact filename to save it as (e.g. 'song.mp3')
 * @returns The size of the file written in bytes.
 */
export async function saveToOPFS(responseBody: ReadableStream<Uint8Array>, filename: string): Promise<number> {
  // 1. Request access to the root directory of the OPFS for this origin.
  const opfsRoot = await navigator.storage.getDirectory();

  // 2. Create (or open) a file handle in the root directory.
  // We set create: true so it initializes an empty file if it doesn't exist.
  const fileHandle = await opfsRoot.getFileHandle(filename, { create: true });

  // 3. Create a writable stream to this file.
  const writable = await fileHandle.createWritable();

  // 4. Pipe the incoming network stream directly into the file.
  // This is highly efficient and doesn't require loading the whole file into RAM.
  await responseBody.pipeTo(writable);

  // 5. Verify and return the size of the written file.
  const file = await fileHandle.getFile();
  return file.size;
}

/**
 * Generates an Object URL for an OPFS file so it can be used in an <audio> tag.
 * 
 * @param filename - The name of the file previously saved.
 * @returns A temporary blob:// URL. Remember to URL.revokeObjectURL() when done to free memory.
 */
export async function getOpfsAudioUrl(filename: string): Promise<string> {
  const opfsRoot = await navigator.storage.getDirectory();
  const fileHandle = await opfsRoot.getFileHandle(filename);
  
  // We retrieve the actual File object from the handle.
  const file = await fileHandle.getFile();
  
  // Create a temporary URL that the browser's audio element can stream from.
  return URL.createObjectURL(file);
}

/**
 * Deletes a file from OPFS.
 */
export async function deleteFromOPFS(filename: string): Promise<void> {
  const opfsRoot = await navigator.storage.getDirectory();
  await opfsRoot.removeEntry(filename);
}
