export type PixelData = {
  x: number;
  y: number;
  color: string;
};

export type CanvasState = {
  pixels: PixelData[];
  canvasPosition: { x: number; y: number };
  canvasScale: number;
  selectedColor: string;
};

const STORAGE_KEY = "airplace_canvas_state";

export function saveCanvasState(state: CanvasState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Error when saving canvas state:", error);
  }
}

export function loadCanvasState(): CanvasState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as CanvasState;
  } catch (error) {
    console.error("Error when loading canvas state:", error);
    return null;
  }
}

export function addPixelToState(state: CanvasState, pixel: PixelData): CanvasState {
  const existingIndex = state.pixels.findIndex(
    (p) => p.x === pixel.x && p.y === pixel.y
  );

  let newPixels: PixelData[];
  if (existingIndex >= 0) {
    newPixels = state.pixels.map((p, idx) =>
      idx === existingIndex ? pixel : p
    );
  } else {
    newPixels = [...state.pixels, pixel];
  }
  return {
    ...state,
    pixels: newPixels,
  };
}

export function clearCanvasState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Error when clearing canvas state:", error);
  }
}
