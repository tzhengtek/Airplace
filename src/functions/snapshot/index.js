import { Storage } from '@google-cloud/storage';
import functions from '@google-cloud/functions-framework';
import { fetchAllPixels } from './firestore.js';
import { normalizePixels, drawSnapshot } from './utils.js';

const storage = new Storage();

functions.http('snapshot-make', async (req, res) => {
  try {
    const bucket = 'serverless-epitech-snapshots';

    if (Buffer.from(req.body.message.data, 'base64').toString('utf-8') == "schedule") {
      console.log('start creating sheduled file');
      var filename = 'snapshot-schedule.png';
    } else {
      console.log('[snapshot-make] start reading message');
      const userId = Buffer.from(req.body.message.data, 'base64').toString('utf-8');
      var filename = `snapshot-${userId}.png`;
    }
    console.log('[snapshot-make] start fetching pixel');
    const rawPixels = await fetchAllPixels();
    const pixels = normalizePixels(rawPixels, 100);
    const buffer = drawSnapshot(pixels, { width: 100, height: 100, tileSize: 1, background: '#FFFFFF' });
    console.log('[snapshot-make] start writing in bucket');
    const bucketRef = storage.bucket(bucket);
    const file = bucketRef.file(filename);
    await file.save(buffer, { contentType: 'image/png' });

    return res.status(201).send();
  } catch (err) {
    console.error('build-image error', err);
    return res.status(500).send('internal error');
  }
});


