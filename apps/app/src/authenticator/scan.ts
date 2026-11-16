import jsQR from 'jsqr';

/**
 * Reading two-factor QR codes on this device (web): from the camera or from a picture. Nothing is uploaded:
 * pixels go to the browser's own BarcodeDetector when it has one, else to jsQR (bundled). Images and camera
 * frames are dropped as soon as they've been read; the camera stops the moment a code is found.
 */

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
let native: Detector | null | undefined;
function detector(): Detector | null {
  if (native !== undefined) return native;
  const BD = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  try { native = BD ? new BD({ formats: ['qr_code'] }) : null; } catch { native = null; }
  return native;
}

/** The text in a QR code in this canvas, or null. */
async function readCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const d = detector();
  if (d) {
    try { const r = await d.detect(canvas); if (r[0]?.rawValue) return r[0].rawValue; } catch { /* fall through to jsQR */ }
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !canvas.width || !canvas.height) return null;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

const MAX_SIDE = 1600; // big screenshots are scaled down: faster, and QR codes survive it

/** Reads a QR code from an image file (a screenshot). Null when there isn't one. */
export async function readQrFromFile(file: Blob): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // transparent PNGs read as white
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const text = await readCanvas(canvas);
    canvas.width = 0; canvas.height = 0;
    return text;
  } finally { URL.revokeObjectURL(url); }
}

export const canUseCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * Starts the back camera in `video` and reads frames until a QR code is found (`onText`), then stops.
 * `cancelled` is checked after the permission wait and on every frame. Returns a stop function. Throws if the camera can't be opened (refused, none, insecure page).
 */
export async function scanWithCamera(video: HTMLVideoElement, onText: (text: string) => void, cancelled: () => boolean = () => false): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  let stopped = false;
  const stop = () => { stopped = true; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
  if (cancelled()) { stop(); return stop; } // stopped (or left) while the permission prompt was open
  video.srcObject = stream; video.muted = true; video.setAttribute('playsinline', 'true');
  await video.play().catch(() => {});
  const canvas = document.createElement('canvas');
  const tick = async () => {
    if (!stopped && cancelled()) stop();
    if (stopped) return;
    if (video.videoWidth) {
      const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d', { willReadFrequently: true })?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const text = await readCanvas(canvas).catch(() => null);
      if (text && !stopped) { stop(); canvas.width = 0; onText(text); return; }
    }
    setTimeout(tick, 150);
  };
  void tick();
  return stop;
}
