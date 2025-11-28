import { v1 as pubsubV1 } from '@google-cloud/pubsub';
import { PubSub } from '@google-cloud/pubsub';
import { Storage } from '@google-cloud/storage';
import sharpMod from 'sharp';
import functions from '@google-cloud/functions-framework';

const subscriberAdmin = new pubsubV1.SubscriberClient();
const storage = new Storage();
const pubsub = new PubSub();

// ---------- CONFIG ----------
const SUBSCRIPTION_NAME = process.env.SUBSCRIPTION_NAME || 'sub-pixel-update-view';
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'serveless-epitech-dev';
const SNAPSHOT_BUCKET = 'serverless-epitech-snapshots';
const SNAPSHOT_NAME = 'snapshot-schedule.png';
const MAX_MESSAGES_PER_PULL = 1000;
const MAX_TOTAL_MESSAGES = Number(process.env.MAX_TOTAL_MESSAGES || 10000);
const ACK_EXTENSION_SECONDS = 600;

export const COLOR_DEFINES = {
  0: "#000000",
  1: "#696969",
  2: "#555555",
  3: "#808080",
  4: "#FFFFFF",
  5: "#FF999A",
  6: "#CC3233",
  7: "#DC143C",
  8: "#990001",
  9: "#800000",
  10: "#FF5701",
  11: "#CCFF8C",
  12: "#81DE75",
  13: "#016F3C",
  14: "#3A55B4",
  15: "#6CADE0",
  16: "#8BD9FF",
  17: "#03FFFF",
  18: "#B87EFF",
  19: "#BE45FF",
  20: "#FA3A83",
  21: "#FF9900",
  22: "#FFE600",
  23: "#573400"
};

function subscriptionPath() {
  return subscriberAdmin.subscriptionPath(PROJECT_ID, SUBSCRIPTION_NAME);
}

async function pullAllMessagesFast() {
  const subscription = subscriptionPath();
  const collectedMessages = [];
  const ackIds = [];
  let batch = 0;
  console.time('[pullAllMessages] Total time');
  while (true) {
    batch++;
    const [resp] = await subscriberAdmin.pull({
      subscription,
      maxMessages: MAX_MESSAGES_PER_PULL,
      returnImmediately: true,
    });

    const messages = resp.receivedMessages || [];

    if (messages.length === 0) {
      console.info(`[pullAllMessages] batch #${batch}: empty - stopping`);
      break;
    }

    console.info(`[pullAllMessages] batch #${batch}: ${messages.length} messages`);

    const newAckIds = messages.map(m => m.ackId);
    ackIds.push(...newAckIds);

    const ackPromise = subscriberAdmin.modifyAckDeadline({
      subscription,
      ackIds: newAckIds,
      ackDeadlineSeconds: ACK_EXTENSION_SECONDS,
    }).catch(err => console.warn('[pullAllMessages] ACK extension failed:', err));

    const parsePromises = messages.map(async (rm) => {
      try {
        if (!rm.message?.data) return null;
        return Buffer.from(rm.message.data, "base64").toString("utf8");
      } catch (err) {
        console.warn(`[pullAllMessages] Failed to parse message:`, err);
        return null;
      }
    });

    const [parsedMessages] = await Promise.all([
      Promise.all(parsePromises),
      ackPromise
    ]);

    collectedMessages.push(...parsedMessages.filter(m => m !== null));
    if (collectedMessages.length >= MAX_TOTAL_MESSAGES) {
      console.warn(`[pullAllMessages] reached MAX_TOTAL_MESSAGES=${MAX_TOTAL_MESSAGES}, stopping`);
      break;
    }
  }

  console.timeEnd('[pullAllMessages] Total time');
  console.info(`[pullAllMessages] DONE → total ${collectedMessages.length} messages`);
  return { collectedMessages, ackIds };
}

async function resetAckDeadlineOptimized(ackIds) {
  if (ackIds.length === 0) return;

  const subscription = subscriptionPath();
  const chunkSize = 2000;
  const chunks = [];

  for (let i = 0; i < ackIds.length; i += chunkSize) {
    chunks.push(ackIds.slice(i, i + chunkSize));
  }

  console.time('[resetAckDeadline]');
  await Promise.all(
    chunks.map(chunk =>
      subscriberAdmin.modifyAckDeadline({
        subscription,
        ackIds: chunk,
        ackDeadlineSeconds: 0
      }).catch(err => console.warn('[resetAckDeadline] Chunk error:', err))
    )
  );

  console.timeEnd('[resetAckDeadline]');
  console.info(`[resetAckDeadline] Restored ${ackIds.length} messages`);
}

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch (err) {
    return null;
  }
}

function parseMessagesToPixels(messageStrings) {
  const out = [];
  if (!Array.isArray(messageStrings) || messageStrings.length === 0) return out;

  for (const msgStr of messageStrings) {
    if (!msgStr) continue;
    const obj = tryParseJson(msgStr);
    if (!obj) {
      console.warn('[parseMessagesToPixels] invalid json message, skipping');
      continue;
    }

    const { chunkX, chunkY, size = 10, pixels } = obj;
    if (typeof chunkX !== 'number' || typeof chunkY !== 'number' || !pixels || typeof pixels !== 'object') {
      console.warn('[parseMessagesToPixels] message missing expected fields (chunkX,chunkY,pixels), skipping', { hasChunkX: typeof chunkX === 'number', hasChunkY: typeof chunkY === 'number', hasPixels: !!pixels });
      continue;
    }

    for (const key of Object.keys(pixels)) {
      const parts = key.split('_');
      if (parts.length !== 2) continue;
      const px = Number(parts[0]);
      const py = Number(parts[1]);
      if (Number.isNaN(px) || Number.isNaN(py)) continue;

      const val = pixels[key];
      if (!val) continue;
      const colorIndex = val.color ?? val.col ?? null;
      const colorHex = colorIndex !== null && COLOR_DEFINES[colorIndex] ? COLOR_DEFINES[colorIndex] : (val.colorHex || null);

      const globalX = chunkX * size + px;
      const globalY = chunkY * size + py;

      out.push({ x: globalX, y: globalY, color: colorHex });
    }
  }
  return out;
}

function hexToRgba(hex) {
  if (!hex || typeof hex !== 'string') return [0, 0, 0, 255];
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
      255
    ];
  }
  if (h.length === 6) {
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
      255
    ];
  }
  return [0, 0, 0, 255];
}

async function renderSnapshot(newPixels) {
  const bucket = storage.bucket(SNAPSHOT_BUCKET);
  const file = bucket.file(SNAPSHOT_NAME);
  const [buffer] = await file.download();
  const img = sharpMod(buffer);
  const metadata = await img.metadata();
  const width = metadata.width ?? (process.env.IMAGE_WIDTH || 100);
  const height = metadata.height ?? (process.env.IMAGE_HEIGHT || 100);
  const raw = await img.ensureAlpha().raw().toBuffer();
  const channels = 4;

  if (Array.isArray(newPixels) && newPixels.length > 0) {
    for (const p of newPixels) {
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      const x = p.x;
      const y = p.y;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const idx = (y * width + x) * channels;
      const rgba = hexToRgba(p.color);
      raw[idx] = rgba[0];
      raw[idx + 1] = rgba[1];
      raw[idx + 2] = rgba[2];
      raw[idx + 3] = rgba[3] ?? 255;
    }
  }

  return sharpMod(raw, { raw: { width, height, channels } }).png().toBuffer();
}

export async function generateView(payload) {
  let pulled = { collectedMessages: [], ackIds: [] };
  try {
    pulled = await pullAllMessagesFast();
  console.info(`[generateView] received ${pulled.collectedMessages.length} messages`);
  console.info(`[generateView] received ${pulled.collectedMessages} messages`);
  } catch (err) {
    console.error('[generateView] pull failed', err);
  }

  try {
  var parsedPixels = parseMessagesToPixels(pulled.collectedMessages);
  console.info(`[generateView] Parsed pixels: ${parsedPixels.length} items. Sample:`, parsedPixels);
  } catch (err) {
    console.error('[generateView] Failed to parse messages to pixels', err);
  }

  try {
    await resetAckDeadlineOptimized(pulled.ackIds);
  } catch (err) {
    console.error('[generateView] Failed to re-expose messages', err);
  }

  try {
  return await renderSnapshot(parsedPixels);
  } catch (err) {
    console.error('[generateView] Rendering failed', err);
    throw err;
  }
}

functions.http('view-make', async (req, res) => {
  try {
    const bucketView = 'serverless-epitech-view';
    try {
    const payload = JSON.parse(Buffer.from(req.body.message.data, 'base64').toString('utf-8'));
    console.log("[view-make] Payload reçu :", payload);
    }  catch (err) {
      console.error("[view-make] Failed to parse payload:", err);
      return res.status(400).send('invalid payload');
    }
    const buffer = await generateView(payload);
    console.log("[view-make] Image générée");
    const bucketViewRef = storage.bucket(bucketView);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = bucketViewRef.file(`view-${payload.userId}-${stamp}.png`);
    await file.save(buffer, { contentType: 'image/png' });
    const responsePayload = {
      command: "view_callback",
      interactionToken: payload.interactionToken,
      imagePath: file.name
    };
    console.log("[view-make] file :", file.name);
    console.log("[view-make] Réponse prête :", responsePayload);

    try {
      const topic = pubsub.topic('view.callback');
      const messageBuffer = Buffer.from(JSON.stringify(responsePayload));
      await topic.publishMessage({ data: messageBuffer });
      console.info('[view-make] Published responsePayload to view.callback');
    } catch (err) {
      console.error('[view-make] Failed to publish responsePayload', err);
    }

    return res.status(201).send();
  } catch (err) {
    console.error("Erreur dans processViewRequest :", err);
    return res.status(500).send('internal error');
  }
});
