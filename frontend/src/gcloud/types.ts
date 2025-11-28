// types.ts
export interface Pixel {
    x: number;
    y: number;
    color: string;
  }
  
  export interface CanvasChunk {
    id?: string; // firestore doc ID (added later)
    chunkX: number;
    chunkY: number;
    size: number;
    pixels: Pixel[]; // array of pixels in the chunk
    updatedAt: number;
  }