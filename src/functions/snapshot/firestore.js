import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({ credential: applicationDefault() });
const db = getFirestore(app, "serverless-epitech-firestore");

export async function fetchAllPixels(collectionName = "canvas_chunks") {
  const CHUNK_SIZE = 10;
  const pixels = [];

  const snapshot = await db.collection(collectionName).get();
  console.info(`[snapshot-make] docs=${snapshot.size}`, snapshot.docs.map(doc => doc.id));

  for (const doc of snapshot.docs) {
    const match = /^canvas_chunks_(-?\d+)_(-?\d+)$/.exec(doc.id);
    if (!match) continue;
    console.info(`[snapshot-make] processing doc=${doc.id}`);
    const [_, chunkXStr, chunkYStr] = match;
    const chunkX = Number(chunkXStr);
    const chunkY = Number(chunkYStr);

    const pixelMap = doc.get("pixels");
    if (!pixelMap) continue;
    console.info(`[snapshot-make] pixel entries=${Object.keys(pixelMap)} in doc=${doc.id}`);
  for (const [key, { color } = {}] of Object.entries(pixelMap)) {
      if (!/^-?\d+_-?\d+$/.test(key)) continue;

      const [pxStr, pyStr] = key.split("_");
      console.info(`[snapshot-make] processing pixel key=${key} in doc=${doc.id}`);
      const px = Number(pxStr);
      const py = Number(pyStr);
  if (color === undefined || color === null) continue;
      pixels.push({
        x: chunkX * CHUNK_SIZE + px,
        y: chunkY * CHUNK_SIZE + py,
        color,
      });
      console.info(`[snapshot-make] added pixel x=${chunkX * CHUNK_SIZE + px} y=${chunkY * CHUNK_SIZE + py} color=${color} from key=${key} in doc=${doc.id}`);
    }
  }

  console.info(`[snapshot-make] total=${pixels.length}`);
  return pixels;
}
