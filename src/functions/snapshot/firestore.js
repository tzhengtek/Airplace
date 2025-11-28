import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({ credential: applicationDefault() });
const db = getFirestore(app, "serverless-epitech-firestore");

export async function fetchAllPixels(collectionName = "canvas_chunks") {
  const CHUNK_SIZE = 10;
  const pixels = [];

  const snapshot = await db.collection(collectionName).get();
  console.info(`[snapshot-make] docs=${snapshot.size}`);

  for (const doc of snapshot.docs) {
    const match = /^canvas_chunks_(-?\d+)_(-?\d+)$/.exec(doc.id);
    if (!match) continue;

    const [_, chunkXStr, chunkYStr] = match;
    const chunkX = Number(chunkXStr);
    const chunkY = Number(chunkYStr);

    const pixelMap = doc.get("pixels");
    if (!pixelMap) continue;

  for (const [key, { color } = {}] of Object.entries(pixelMap)) {
      if (!/^-?\d+_-?\d+$/.test(key)) continue;

      const [pxStr, pyStr] = key.split("_");
      const px = Number(pxStr);
      const py = Number(pyStr);
  if (!color) continue;

      pixels.push({
        x: chunkX * CHUNK_SIZE + px,
        y: chunkY * CHUNK_SIZE + py,
        color,
      });
    }
  }

  console.info(`[snapshot-make] total=${pixels.length}`);
  return pixels;
}
