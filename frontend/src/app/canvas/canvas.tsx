"use client";

import { JSX, useEffect, useRef, useState } from "react";
import {
  ReactPixelArtCanvas,
  BackgroundCanvas,
  DrawingCanvas,
  ForegroundCanvas,
} from "react-pixel-art-canvas";
import type { CanvasRef, Tool } from "react-pixel-art-canvas";
import { useAppContext } from "../context/AppContext";

export function Canvas() {
  const gridSize = 100;
  const canvaSize = 500;

  const drawingCanvasRef = useRef<CanvasRef>(null);
  const foregroundCanvasRef = useRef<CanvasRef>(null);

  const [tool, setTool] = useState<Tool>("paint");
  const { selectedColor, setSelectedColor } = useAppContext();

  const handleClear = () => {
    drawingCanvasRef.current?.clearCanvas();
  };

  return (
    <div>
      <button
        className="bg-white text-xl text-black hover:bg-blue-100"
        onClick={() => {
          handleClear;
        }}
      >
        clear
      </button>
      <div>{selectedColor}</div>
      <ReactPixelArtCanvas
        width={canvaSize}
        height={canvaSize}
        className="bg-white"
      >
        <DrawingCanvas
          ref={drawingCanvasRef}
          gridSize={gridSize}
          width={canvaSize}
          height={canvaSize}
          selectedColor={selectedColor}
          selectedTool={tool}
          history={true}
        />
        <ForegroundCanvas
          ref={foregroundCanvasRef}
          gridSize={gridSize}
          width={canvaSize}
          height={canvaSize}
          foregroundVisible={false}
          gridStrokeColor="#d1d1d1"
        />
      </ReactPixelArtCanvas>
    </div>
  );
}
