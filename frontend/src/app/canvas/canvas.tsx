"use client";

import { JSX, useEffect, useRef, useState } from "react";
import {
  ReactPixelArtCanvas,
  BackgroundCanvas,
  DrawingCanvas,
  ForegroundCanvas,
} from "react-pixel-art-canvas";
import type { CanvasRef, Tool } from "react-pixel-art-canvas";

export function Canvas() {
  const gridSize = 100;
  const canvaSize = 500;

  const drawingCanvasRef = useRef<CanvasRef>(null);
  const backgroundCanvasRef = useRef<CanvasRef>(null);
  const foregroundCanvasRef = useRef<CanvasRef>(null);

  const [tool, setTool] = useState<Tool>("paint");
  const [color, setColor] = useState("#113db8");

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
      <ReactPixelArtCanvas
        width={canvaSize}
        height={canvaSize}
        styles={{ border: "1px solid #ccc" }}
      >
        <DrawingCanvas
          ref={drawingCanvasRef}
          gridSize={gridSize}
          width={canvaSize}
          height={canvaSize}
          selectedColor={color}
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
