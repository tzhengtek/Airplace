"use client";

import { useEffect, useRef, MouseEvent } from "react";
import { CanvaPixel, coordsToId } from "./canva-pixel/canva-pixel";
import { useAppContext } from "../context/AppContext";
import {
  GRID_SIZE,
  PIXEL_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
} from "@/constants/constants";

const CLICK_DISTANCE_THRESHOLD = 5;
const ZOOM_FACTOR = 0.05;

function clampPosition(x: number, y: number, scale: number) {
  const canvasWidth = GRID_SIZE * PIXEL_SIZE * scale;
  const canvasHeight = GRID_SIZE * PIXEL_SIZE * scale;

  const cellSize = PIXEL_SIZE * scale;

  const limitX = canvasWidth / 2 - cellSize / 2;
  const limitY = canvasHeight / 2 - cellSize / 2;

  return {
    x: Math.max(-limitX, Math.min(limitX, x)),
    y: Math.max(-limitY, Math.min(limitY, y)),
  };
}

export function Canvas() {
  const {
    canvasPosition,
    setCanvasPosition,
    canvasScale,
    setCanvasScale,
    shouldZoom,
    setShouldZoom,
    targetPixel,
    setTargetPixel,
  } = useAppContext();

  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();

    const direction = e.deltaY < 0 ? 1 : -1;
    const oldScale = canvasScale;

    let nextScale: number;

    if (direction === 1) {
      nextScale = oldScale * (1 + ZOOM_FACTOR);
    } else {
      nextScale = oldScale / (1 + ZOOM_FACTOR);
    }
    const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));

    if (newScale !== oldScale) {
      const scaleRatio = newScale / oldScale;
      const nextX = canvasPosition.x * scaleRatio;
      const nextY = canvasPosition.y * scaleRatio;
      setCanvasScale(newScale);
      setCanvasPosition(clampPosition(nextX, nextY, newScale));
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDraggingRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    hasDraggedRef.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !lastPosRef.current) return;

    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;

    setCanvasPosition((prev) =>
      clampPosition(prev.x + dx, prev.y + dy, canvasScale)
    );

    if (dragStartRef.current) {
      const totalDx = e.clientX - dragStartRef.current.x;
      const totalDy = e.clientY - dragStartRef.current.y;
      const distance = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
      if (distance > CLICK_DISTANCE_THRESHOLD) {
        hasDraggedRef.current = true;
      }
    }

    lastPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const stopDragging = () => {
    isDraggingRef.current = false;
    lastPosRef.current = null;
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingRef.current && !hasDraggedRef.current) {
      handleCanvasClick(e as MouseEvent<HTMLDivElement>);
    }
    stopDragging();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    isDraggingRef.current = true;
    lastPosRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !lastPosRef.current) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const dx = touch.clientX - lastPosRef.current.x;
    const dy = touch.clientY - lastPosRef.current.y;

    setCanvasPosition((prev) =>
      clampPosition(prev.x + dx, prev.y + dy, canvasScale)
    );

    lastPosRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = () => {
    stopDragging();
  };

  useEffect(() => {
    const handleWindowMouseUp = () => stopDragging();
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("mouseleave", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("mouseleave", handleWindowMouseUp);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const animateViewTo = (
    targetX: number,
    targetY: number,
    targetScale: number
  ) => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    const duration = 800;
    const startTime = performance.now();

    const startX = canvasPosition.x;
    const startY = canvasPosition.y;
    const startScale = canvasScale;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);

      const eased = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      const newX = startX + (targetX - startX) * eased;
      const newY = startY + (targetY - startY) * eased;
      const newScale = startScale + (targetScale - startScale) * eased;

      setCanvasScale(newScale);

      setCanvasPosition(clampPosition(newX, newY, newScale));

      if (t < 1) {
        animationRef.current = requestAnimationFrame(step);
      } else {
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    if (shouldZoom && targetPixel) {
      const centerIndex = (GRID_SIZE - 1) / 2;
      const dx = targetPixel.x - centerIndex;
      const dy = targetPixel.y - centerIndex;

      const TARGET_SCALE = MAX_ZOOM;

      const cellSizeBase = PIXEL_SIZE * TARGET_SCALE;
      const targetX = -dx * cellSizeBase;
      const targetY = -dy * cellSizeBase;

      animateViewTo(targetX, targetY, TARGET_SCALE);
      setShouldZoom(false);
    }
  }, [shouldZoom, targetPixel, animateViewTo, canvasScale]);

  const handleCanvasClick = (e: MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX;
    const clickY = e.clientY;
    if (
      clickX < rect.left ||
      clickX > rect.right ||
      clickY < rect.top ||
      clickY > rect.bottom
    ) {
      return;
    }
    const cellSizeScreen = rect.width / GRID_SIZE;

    const relativeX = clickX - rect.left;
    const relativeY = clickY - rect.top;

    const cellX = Math.floor(relativeX / cellSizeScreen);
    const cellY = Math.floor(relativeY / cellSizeScreen);

    if (cellX < 0 || cellX >= GRID_SIZE || cellY < 0 || cellY >= GRID_SIZE) {
      return;
    }
    const centerIndex = (GRID_SIZE - 1) / 2;
    const dx = cellX - centerIndex;
    const dy = cellY - centerIndex;

    const TARGET_SCALE = canvasScale;

    const cellSizeBase = PIXEL_SIZE * TARGET_SCALE;
    const targetX = -dx * cellSizeBase;
    const targetY = -dy * cellSizeBase;
    animateViewTo(targetX, targetY, TARGET_SCALE);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setTargetPixel(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    if (
      centerX < rect.left ||
      centerX > rect.right ||
      centerY < rect.top ||
      centerY > rect.bottom
    ) {
      setTargetPixel(null);
      return;
    }

    const canvasPixelWidth = GRID_SIZE * PIXEL_SIZE;
    const scale = rect.width / canvasPixelWidth;

    const relativeX = centerX - rect.left;
    const relativeY = centerY - rect.top;

    const cellX = Math.floor(relativeX / (PIXEL_SIZE * scale));
    const cellY = Math.floor(relativeY / (PIXEL_SIZE * scale));

    if (cellX < 0 || cellX >= GRID_SIZE || cellY < 0 || cellY >= GRID_SIZE) {
      setTargetPixel(null);
      return;
    }

    const id = coordsToId(cellX, cellY);
    setTargetPixel({ x: cellX, y: cellY, zoom: scale });
  }, [canvasPosition, canvasScale, setTargetPixel]);

  const centralCellSize = PIXEL_SIZE * canvasScale;

  return (
    <div
      className="w-screen h-screen overflow-hidden bg-black flex justify-center items-center cursor-grab active:cursor-grabbing select-none relative"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        style={{
          transform: `translate(${canvasPosition.x}px, ${canvasPosition.y}px) scale(${canvasScale})`,
          transformOrigin: "center center",
        }}
        className="flex justify-center items-center pointer-events-auto"
      >
        <CanvaPixel canvasRef={canvasRef} />
      </div>

      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div
          style={{
            width: centralCellSize,
            height: centralCellSize,
            boxSizing: "border-box",
            border: "1px solid rgba(0, 72, 255, 0.9)",
          }}
        />
      </div>
    </div>
  );
}
