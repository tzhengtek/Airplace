import express from 'express';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Storage } from '@google-cloud/storage';
import { createCanvas } from 'canvas';

const app = express();
app.use(express.json());

const firestoreApp = initializeApp({
    credential: applicationDefault()
});
const db = getFirestore(firestoreApp, 'serverless-epitech-firestore');
const storage = new Storage();

const COLOR_DEFINES = {
  0: '#FFFFFF', // BLANC
  1: '#000000', // NOIR
  2: '#FF0000', // ROUGE
  3: '#00FF00', // VERT
  4: '#0000FF', // BLEU
  5: '#FFFF00', // JAUNE
  6: '#FF00FF', // MAGENTA
  7: '#00FFFF', // CYAN
};

app.post('/', async (req, res) => {
  try {
    const bucket = 'serverless-epitech-snapshots';
    const filename = `canva-${Date.now()}.png`;
    const pixelsSnap = await db.collection('pixels').get();

    const pixels = [];
    pixelsSnap.forEach(doc => {
      const data = doc.data();
      const x = Number(data.x);
      const y = Number(data.y);
      let color = Number(data.color);
      if (color in COLOR_DEFINES) {
        color = COLOR_DEFINES[color];
      } else {
        color = COLOR_DEFINES[0];
       }
      pixels.push({ x, y, color });
    });

    const SNAPSHOT_SIZE = 100;
    const TILE_SIZE = 1;
    const width = SNAPSHOT_SIZE;
    const height = SNAPSHOT_SIZE;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    for (const p of pixels) {
      if (p.x < 0 || p.x >= SNAPSHOT_SIZE || p.y < 0 || p.y >= SNAPSHOT_SIZE) continue;
      const color = p.color || '#FFFFFF';
      ctx.fillStyle = color;
      ctx.fillRect(p.x, p.y, TILE_SIZE, TILE_SIZE);
    }
    const buffer = canvas.toBuffer('image/png');
    const bucketRef = storage.bucket(bucket);
    const file = bucketRef.file(filename);
  await file.save(buffer, { contentType: 'image/png' });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  return res.status(201).send(buffer);


  } catch (err) {
    console.error('build-image error', err);
    return res.status(500).send('internal error');
  }
});

const port = 8080;
app.listen(port, () => console.log(`cloudstorage function listening on ${port}`));

export default app;
