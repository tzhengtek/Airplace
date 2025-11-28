"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Dropdown } from "./dropdown/dropdown";
import { Canvas } from "./canvas/canvas";
import { ColorPanel } from "@/app/canvas/color-panel/color-panel";
import { ProfileAvatar } from "@/app/profile-avatar/profile-avatar";
import { ColorCoord } from "./canvas/canva-coord/canva-coord";
import CanvasListener, { ChunkUpdate } from "@/gcloud/CanvasListener";
import { CanvasChunk } from "@/gcloud/types";
import { paintPixel } from "@/app/canvas/canva-pixel/canva-pixel";
import { COLORS_PANEL } from "@/constants/constants";

type ClientRootProps = {
  children: ReactNode;
};

export default function ClientRoot({ children }: ClientRootProps) {
  const [chunks, setChunks] = useState<Record<string, CanvasChunk>>({});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = document.querySelector("canvas");
    if (canvas instanceof HTMLCanvasElement) {
      canvasRef.current = canvas;
    }
  }, []);

  const handleChunkUpdate = useCallback((update: ChunkUpdate) => {
    setChunks((prev) => {
      if (update.type === "removed") {
        const copy = { ...prev };
        delete copy[update.id];
        return copy;
      }

      const chunkX = update.data.chunkX;
      const chunkY = update.data.chunkY;
      const size = update.data.size;

      update.data.pixels.forEach((pixel) => {
        const color = COLORS_PANEL[pixel.color as unknown as number];
        paintPixel(canvasRef, chunkX * size + pixel.x, chunkY * size + pixel.y, color as string);
      });

      return {
        ...prev,
        [update.id]: update.data,
      };
    });
  }, []);

  return (
    <>
      <CanvasListener onChunkUpdate={handleChunkUpdate} />
      <Dropdown />
      <Canvas />
      <ColorCoord />
      <ColorPanel />
      <ProfileAvatar />
      {children}
    </>
  );
}


