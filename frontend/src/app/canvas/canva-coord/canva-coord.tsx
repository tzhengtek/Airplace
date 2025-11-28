"use client";

import { CircleX } from "lucide-react";
import { useAppContext } from "@/app/context/AppContext";

export function ColorCoord() {
  const { targetPixel } = useAppContext();

  return (
    <div className="flex fixed justify-center top-4 left-0 right-0">
      <div className="bg-white px-6 py-2 text-m text-black rounded-full shadow-xl/50">
        {targetPixel ? (
          <div className="flex items-center space-x-2">
            <span className="font-mono">
              ({targetPixel.x}, {targetPixel.y}) {targetPixel.zoom.toFixed(1)}x
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <span className="font-mono">No pixel selected</span>
            <CircleX className="text-red-500" />
          </div>
        )}
      </div>
    </div>
  );
}
