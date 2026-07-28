/**
 * Preparing a face photo for an access terminal.
 *
 * A Hikvision MinMoe will not take a phone photo as it comes off the camera: it
 * wants a small, frontal JPEG — in practice a couple of hundred kilobytes, not
 * the three or four megabytes a modern phone produces. Sending the original
 * gets a quality error from the device that reads like the terminal's fault
 * when it is really the picture's.
 *
 * So the browser resizes before anything is uploaded. It happens here rather
 * than on the server because the file is already in the page, and shipping four
 * megabytes across the network to throw away 95% of it is work nobody needs.
 */

/** Roughly a portrait frame — comfortably above what the device matches on. */
const MAX_WIDTH = 480;
const MAX_HEIGHT = 640;

/** The budget the terminal is happy with, with room to spare. */
const MAX_BYTES = 200_000;

/** Tried in order until one fits the budget. */
const QUALITY_STEPS = [0.92, 0.85, 0.75, 0.65, 0.55, 0.45];

/** How many bytes a `data:` URL's payload actually is. */
export const dataUrlBytes = (dataUrl: string): number => {
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  // base64 pads to a multiple of four, so each `=` stands for a byte that is
  // not really there.
  let padding = 0;

  if (payload.endsWith("==")) {
    padding = 2;
  } else if (payload.endsWith("=")) {
    padding = 1;
  }

  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
};

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

/**
 * Scales a picked photo down to something a terminal will accept, and returns
 * it as a JPEG data URL.
 *
 * Falls back to the untouched file if the browser cannot decode it — better to
 * let the device refuse a photo than to refuse it here for a reason that might
 * be ours.
 */
export const prepareFacePhoto = async (file: File): Promise<string> => {
  let bitmap: ImageBitmap;

  try {
    // `from-image` applies the EXIF rotation a phone records rather than baking
    // in a sideways face, which no matcher would forgive.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return await readAsDataUrl(file);
  }

  const scale = Math.min(
    1,
    MAX_WIDTH / bitmap.width,
    MAX_HEIGHT / bitmap.height
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();

    return await readAsDataUrl(file);
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of QUALITY_STEPS) {
    const encoded = canvas.toDataURL("image/jpeg", quality);

    if (dataUrlBytes(encoded) <= MAX_BYTES) {
      return encoded;
    }
  }

  // Even at the lowest quality this is far smaller than what was picked, and a
  // slightly soft photo the device accepts beats a sharp one it refuses.
  return canvas.toDataURL("image/jpeg", 0.4);
};
