import { Storage } from '@google-cloud/storage';
import functions from '@google-cloud/functions-framework';
import { fetchAllPixels } from './firestore.js';
import { normalizePixels, drawSnapshot, resetSubscriptionBacklog } from './utils.js';

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
    try {
      console.info('[snapshot-make] rawPixels count:', rawPixels);
    } catch (err) {
      console.warn('[snapshot-make] Failed to log rawPixels', err);
    }
    const pixels = normalizePixels(rawPixels, 100);
    try {
      console.info('[snapshot-make] normalized pixels count:', pixels);
    } catch (err) {
      console.warn('[snapshot-make] Failed to log normalized pixels', err);
    }
    const buffer = drawSnapshot(pixels, { width: 100, height: 100, tileSize: 1, background: '#FFFFFF' });
    console.log('[snapshot-make] start writing in bucket');
    const bucketRef = storage.bucket(bucket);
    const file = bucketRef.file(filename);
    await file.save(buffer, { contentType: 'image/png' });
    if (filename == 'snapshot-schedule.png') {
      console.log('[snapshot-make] resetting subscription backlog');
      await resetSubscriptionBacklog();
    }
    return res.status(201).send();
  } catch (err) {
    console.error('build-image error', err);
    return res.status(500).send('internal error');
  }
});


