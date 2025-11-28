"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { GRID_SIZE, MIN_ZOOM } from "../../constants/constants";
import {
  CanvasState,
  saveCanvasState,
  loadCanvasState,
  PixelData,
  clearCanvasState,
} from "@/utils/canvasStorage";

export type Point = { x: number; y: number };
export type Coord = { x: number; y: number; zoom: number };

type AppContextType = {
  selectedColor: string;
  setSelectedColor: (color: string) => void;
  isPanelOpen: boolean;
  setIsPanelOpen: (open: boolean) => void;
  isLoginOpen: boolean;
  setIsLoginOpen: (open: boolean) => void;
  isAboutOpen: boolean;
  setIsAboutOpen: (open: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  pixelPosition: Point;
  setPixelPosition: (position: Point | ((prev: Point) => Point)) => void;
  canvasPosition: Point;
  setCanvasPosition: (position: Point | ((prev: Point) => Point)) => void;
  canvasScale: number;
  setCanvasScale: (scale: number | ((prev: number) => number)) => void;
  shouldZoom: boolean;
  setShouldZoom: (zoom: boolean) => void;
  targetPixel: Coord | null;
  setTargetPixel: (
    position: Coord | null | ((prev: Coord | null) => Coord | null)
  ) => void;
  pixels: PixelData[];
  addPixel: (pixel: PixelData) => void;
  resetCanvas: () => void;
  discordToken: string | null;
  setDiscordToken: (token: string | null) => void;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedColor, setSelectedColor] = useState<string>("#000000");
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(false);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [pixelPosition, setPixelPosition] = useState<Point>({
    x: Math.floor(GRID_SIZE / 2),
    y: Math.floor(GRID_SIZE / 2),
  });
  const [canvasPosition, setCanvasPosition] = useState<Point>({ x: 0, y: 0 });
  const [canvasScale, setCanvasScale] = useState<number>(0);
  const [shouldZoom, setShouldZoom] = useState(false);
  const [targetPixel, setTargetPixel] = useState<Coord | null>(null);
  const [pixels, setPixels] = useState<PixelData[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [discordToken, setDiscordToken] = useState<string | null>(null);

  useEffect(() => {
    const savedState = loadCanvasState();
    if (savedState) {
      setPixels(savedState.pixels);
      setSelectedColor(savedState.selectedColor);
      setCanvasPosition(savedState.canvasPosition);
      setCanvasScale(savedState.canvasScale);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    const state: CanvasState = {
      pixels,
      canvasPosition,
      canvasScale,
      selectedColor,
    };
    saveCanvasState(state);
  }, [pixels, canvasPosition, canvasScale, selectedColor, isLoaded]);

  const addPixel = (pixel: PixelData) => {
    setPixels((prevPixels) => {
      const existingIndex = prevPixels.findIndex(
        (p) => p.x === pixel.x && p.y === pixel.y
      );
      if (existingIndex >= 0) {
        const newPixels = [...prevPixels];
        newPixels[existingIndex] = pixel;
        return newPixels;
      }
      return [...prevPixels, pixel];
    });
  };

  const resetCanvas = () => {
    clearCanvasState();
    setPixels([]);
    setCanvasPosition({ x: 0, y: 0 });
    setCanvasScale(MIN_ZOOM);
    setSelectedColor("#000000");
  };

  return (
    <AppContext.Provider
      value={{
        selectedColor,
        setSelectedColor,
        isPanelOpen,
        setIsPanelOpen,
        isLoginOpen,
        setIsLoginOpen,
        isAboutOpen,
        setIsAboutOpen,
        isSettingsOpen,
        setIsSettingsOpen,
        pixelPosition,
        setPixelPosition,
        canvasPosition,
        setCanvasPosition,
        canvasScale,
        setCanvasScale,
        shouldZoom,
        setShouldZoom,
        targetPixel,
        setTargetPixel,
        pixels,
        addPixel,
        resetCanvas,
        discordToken,
        setDiscordToken,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used within an <AppProvider>");
  }
  return ctx;
}
