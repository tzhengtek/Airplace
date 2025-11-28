"use client";

import { useEffect } from "react";
import { GRID_SIZE, PIXEL_SIZE } from "@/constants/constants";
import { useAppContext } from "@/app/context/AppContext";

type CanvaPixelProps = {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
};

// id → (x, y)
function idToCoords(id: number) {
  const x = id % GRID_SIZE;
  const y = Math.floor(id / GRID_SIZE);
  return { x, y };
}

// (x, y) → id
export function coordsToId(x: number, y: number) {
  return y * GRID_SIZE + x;
}

export function paintPixel(
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
  x: number,
  y: number,
  color: string
) {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = color;
  ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
}

export function CanvaPixel({ canvasRef }: CanvaPixelProps) {
  const { pixels } = useAppContext();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = GRID_SIZE * PIXEL_SIZE;
    canvas.height = GRID_SIZE * PIXEL_SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#e4e4e4ff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillRect(0, 0, PIXEL_SIZE, PIXEL_SIZE);

    pixels.forEach((pixel) => {
      ctx.fillStyle = pixel.color;
      ctx.fillRect(
        pixel.x * PIXEL_SIZE,
        pixel.y * PIXEL_SIZE,
        PIXEL_SIZE,
        PIXEL_SIZE
      );
    });
  }, [canvasRef, pixels]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: "pixelated",
          display: "block",
        }}
      />
    </div>
  );
}
