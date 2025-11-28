"use client";
import {
  collection,
  query,
  onSnapshot,
  DocumentChange,
  DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import { CanvasChunk } from "./types";
import { useEffect } from "react";

export interface ChunkUpdate {
  id: string;
  type: DocumentChange<DocumentData>["type"];
  data: CanvasChunk;
}

interface Props {
  onChunkUpdate: (update: ChunkUpdate) => void;
}

export default function CanvasListener({ onChunkUpdate }: Props) {
useEffect(() => {
  const q = query(collection(db, "canvas_chunks"));
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
            const raw = change.doc.data() as {
              pixels?: Record<string, { color?: unknown; Color?: unknown }>;
              lastUpdated?: unknown;
              updatedAt?: unknown;
              size?: unknown;
            };

            const docId = change.doc.id;
            let chunkX = 0;
            let chunkY = 0;
            const suffix = docId.replace("canvas_chunks_", "");
            const [xStr, yStr] = suffix.split("_");
            if (xStr !== undefined && yStr !== undefined) {
              const parsedX = Number(xStr);
              const parsedY = Number(yStr);
              if (!Number.isNaN(parsedX)) chunkX = parsedX;
              if (!Number.isNaN(parsedY)) chunkY = parsedY;
            }

            const pixelsEntries = Object.entries(
              (raw?.pixels as Record<string, { color?: unknown; Color?: unknown }>) || {}
            );
            const pixels = pixelsEntries.map(([key, value]) => {
              const [pxStr, pyStr] = key.split("_");
              const px = Number(pxStr);
              const py = Number(pyStr);
              const color = value?.color ?? value?.Color ?? "";
              return {
                x: Number.isNaN(px) ? 0 : px,
                y: Number.isNaN(py) ? 0 : py,
                color: String(color),
              };
            });

            let updatedAt = 0;
            const ts = raw?.lastUpdated ?? raw?.updatedAt;
            if (ts && typeof (ts as { toMillis?: () => number }).toMillis === "function") {
              updatedAt = (ts as { toMillis: () => number }).toMillis();
            } else if (typeof ts === "number") {
              updatedAt = ts as number;
            }

            const data: CanvasChunk = {
              id: docId,
              chunkX,
              chunkY,
              pixels,
              updatedAt,
              size: raw?.size as number
            };

          onChunkUpdate({
            id: change.doc.id,
            type: change.type,
            data,
          });
        }
      });
    },
    (error) => {
      console.error("Firestore listener error:", error);
    }
  );

  return () => unsub();
  }, [onChunkUpdate]);
  return null;
}
