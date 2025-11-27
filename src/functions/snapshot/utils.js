import { createCanvas, ImageData } from '@napi-rs/canvas';

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

export function normalizePixels(rawPixels = [], snapshotSize = 100) {
  return rawPixels
    .map(p => {
      const x = Number(p.x);
      const y = Number(p.y);
      const colorIndex = Number(p.color);
      const color = COLOR_DEFINES.hasOwnProperty(colorIndex) ? COLOR_DEFINES[colorIndex] : COLOR_DEFINES[0];
      return { x, y, color };
    })
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x < snapshotSize && p.y >= 0 && p.y < snapshotSize);
}

export function drawSnapshot(pixels = [], { width = 100, height = 100, tileSize = 1, background = '#FFFFFF' } = {}) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const total = width * height * 4;
  const buffer = new Uint8ClampedArray(total);

  const bg = hexToRgba(background || '#FFFFFF');
  for (let i = 0; i < total; i += 4) {
    buffer[i] = bg.r;
    buffer[i + 1] = bg.g;
    buffer[i + 2] = bg.b;
    buffer[i + 3] = bg.a;
  }

  const setPixel = (x, y, rgba) => {
    const idx = (y * width + x) * 4;
    buffer[idx] = rgba.r;
    buffer[idx + 1] = rgba.g;
    buffer[idx + 2] = rgba.b;
    buffer[idx + 3] = rgba.a;
  };

  for (const p of pixels) {
    const color = p.color || background;
    const rgba = hexToRgba(color);
    if (p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) {
      setPixel(p.x, p.y, rgba);
    }
  }

  const img = new ImageData(buffer, width, height);
  ctx.putImageData(img, 0, 0);
  return canvas.toBuffer('image/png');
}

function hexToRgba(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16) || 0xFFFFFF;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
    a: 255
  };
}

export async function resetSubscriptionBacklog() {
  const subscriberAdmin = new pubsubV1.SubscriberClient();

  const formatted = subscriberAdmin.subscriptionPath(projectId, subscriptionName);
  const now = {
    seconds: Math.floor(Date.now() / 1000),
    nanos: 0
  };
  await subscriberAdmin.seek({
    subscription: formatted,
    time: now
  });
  console.log("[snapshot-make] backlog ignored, new messages will continue to stream normally");
}
