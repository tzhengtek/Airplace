"use client";

import { useEffect, useState, useRef } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { COLORS_PANEL } from "@/constants/constants";
import { useAppContext } from "@/app/context/AppContext";
import { paintPixel } from "@/app/canvas/canva-pixel/canva-pixel";

export function ColorPanel() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const {
    selectedColor,
    setSelectedColor,
    setShouldZoom,
    targetPixel,
    addPixel,
  } = useAppContext();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [colors, setColors] = useState<string | null>(selectedColor ?? null);

  useEffect(() => {
    const canvas = document.querySelector("canvas");
    if (canvas instanceof HTMLCanvasElement) {
      canvasRef.current = canvas;
    }
  }, []);

  useEffect(() => {
    if (isPanelOpen) {
      setColors(selectedColor ?? null);
    }
  }, [isPanelOpen, selectedColor]);

  return (
    <div className="fixed bottom-4 left-0 right-0 flex justify-center transition-transform hover:scale-110 duration-200">
      <button
        onClick={() => {
          setIsPanelOpen(true);
          setShouldZoom(true);
        }}
        className="bg-white px-8 py-3 text-xl text-black rounded-full shadow-xl/50 hover:shadow-xl/100 transition-shadow duration-300 "
      >
        Place a pixel
      </button>

      <div
        className={`fixed inset-0 z-10 transition-opacity duration-300 ${
          isPanelOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          className={`
            absolute bottom-4 left-1/2
            w-[90%] max-w-m
            bg-white shadow-2xl p-6 rounded-2xl
            transform transition-transform duration-300
            -translate-x-1/2
            ${isPanelOpen ? "translate-y-0" : "translate-y-full"}
          `}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap justify-center">
            {COLORS_PANEL.map((color) => {
              const isSelected = color === colors;

              return (
                <button
                  key={color}
                  onClick={() => setColors(color)}
                  className={`
                    h-12 w-12 rounded-md mx-0.5 border border-gray-300
                    hover:shadow-xl/50 transition-shadow duration-300
                    ${
                      isSelected
                        ? "shadow-[0_0_0_3px_rgba(59,130,246,0.9)] scale-105"
                        : ""
                    }
                  `}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>

          <div className="mt-4 mx-auto flex justify-center gap-7">
            <CircleX
              onClick={() => setIsPanelOpen(false)}
              className="mt-2 bg-slate-900 h-10 text-white px-4 py-2 rounded-lg w-50 hover:shadow-xl/50 transition-shadow duration-300 cursor-pointer"
            />
            <CircleCheck
              onClick={() => {
                if (colors && targetPixel) {
                  setSelectedColor(colors);
                  paintPixel(canvasRef, targetPixel.x, targetPixel.y, colors);
                  addPixel({
                    x: targetPixel.x,
                    y: targetPixel.y,
                    color: colors,
                  });
                }
                setIsPanelOpen(false);
              }}
              className="mt-2 h-10 bg-slate-900 text-white px-4 py-2 rounded-lg w-50 hover:shadow-xl/50 transition-shadow duration-300 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
