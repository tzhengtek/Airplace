import { PubSub } from "@google-cloud/pubsub";
import functions from '@google-cloud/functions-framework';
import { Storage } from '@google-cloud/storage';
import sharpMod from 'sharp';

const pubsub = new PubSub();
const storage = new Storage();
const RESPONSE_TOPIC = "command.queue";

functions.http('view-make', async (req, res) => {
  try {
    const bucketView = 'serverless-epitech-view';
    const payload = JSON.parse(Buffer.from(req.body.message.data, 'base64').toString('utf-8'));
    console.log("[view-make] Payload reçu :", payload);
    const buffer = await generateView(payload); // TODO
    console.log("[view-make] Image générée");
    const bucketViewRef = storage.bucket(bucketView);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = bucketViewRef.file(`view-${payload.userId}-${stamp}.png`);
    await file.save(buffer, { contentType: 'image/png' });
    const responsePayload = {
      command: "view_callback",
      interactionToken: payload.interactionToken,
      "imagePath": file.name
    };
    const attributes = { command: "view_callback" };
    console.log("[view-make] file : ", file.name);
  //await pubsub.topic(RESPONSE_TOPIC).publishMessage({ data: Buffer.from(responsePayload), attributes});
  console.log("[view-make] Réponse publiée :", responsePayload);
    return res.status(201).send();
  } catch (err) {
    console.error("Erreur dans processViewRequest :", err);
  return res.status(500).send('internal error');
  }
});


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

async function generateView(payload) {
  const SNAPSHOT_BUCKET = 'serverless-epitech-snapshots';
  const SNAPSHOT_NAME = 'snapshot-schedule.png';

  const bucket = storage.bucket(SNAPSHOT_BUCKET);
  const file = bucket.file(SNAPSHOT_NAME);
  const [buffer] = await file.download();
  const img = sharpMod(buffer);
  const metadata = await img.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // convert to raw RGBA buffer
  const raw = await img.ensureAlpha().raw().toBuffer();
  const channels = 4;

  // paint 2x2 (4) pixels at top-left black
  for (let y = 0; y < 2 && y < height; y++) {
    for (let x = 0; x < 2 && x < width; x++) {
      const idx = (y * width + x) * channels;
      raw[idx] = 0; // R
      raw[idx + 1] = 0; // G
      raw[idx + 2] = 0; // B
      raw[idx + 3] = 255; // A
    }
  }

  // re-encode PNG from raw buffer
  const outBuffer = await sharpMod(raw, { raw: { width, height, channels } }).png().toBuffer();
  return outBuffer;
}
