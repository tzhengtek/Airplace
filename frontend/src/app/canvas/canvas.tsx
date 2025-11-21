"use client";

import { useEffect, useRef, useState } from "react";
import { CanvaPixel } from "./canva-pixel/canva-pixel";

export function Canvas() {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

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
    const zoomSpeed = 0.05;

    setScale((prev) => {
      const next = prev + direction * zoomSpeed;
      return Math.min(5, Math.max(0.5, next));
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDraggingRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !lastPosRef.current) return;

    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;

    setPosition((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }));

    lastPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const stopDragging = () => {
    isDraggingRef.current = false;
    lastPosRef.current = null;
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

    setPosition((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }));

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

  return (
    <div
      className="w-screen h-screen overflow-hidden bg-black flex justify-center items-center cursor-grab active:cursor-grabbing select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown} // 👈 drag commence partout
      onMouseMove={handleMouseMove}
      onMouseUp={stopDragging}
      onTouchStart={handleTouchStart} // 👈 idem pour le tactile
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: "center center",
        }}
        className="flex justify-center items-center pointer-events-auto"
      >
        <CanvaPixel />
      </div>
    </div>
  );
}
