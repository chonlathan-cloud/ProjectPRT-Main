const DEFAULT_BACKGROUND_THRESHOLD = 232;
const DEFAULT_COLOR_VARIANCE = 18;
const DEFAULT_PADDING = 16;

interface SignatureCleanupOptions {
  backgroundThreshold?: number;
  colorVariance?: number;
  padding?: number;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load signature image'));
    image.src = src;
  });

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const getDefaultSignaturePlacement = () => ({
  x: 0.68,
  y: 0.72,
  width: 0.22,
});

export const getDefaultSignatureCleanupThreshold = () => DEFAULT_BACKGROUND_THRESHOLD;

export const createTransparentSignatureDataUrl = async (
  sourceDataUrl: string,
  options: SignatureCleanupOptions = {}
): Promise<string> => {
  const backgroundThreshold = options.backgroundThreshold ?? DEFAULT_BACKGROUND_THRESHOLD;
  const colorVariance = options.colorVariance ?? DEFAULT_COLOR_VARIANCE;
  const padding = options.padding ?? DEFAULT_PADDING;
  const image = await loadImage(sourceDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Canvas context is unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3];

    if (alpha === 0) {
      continue;
    }

    const maxChannel = Math.max(red, green, blue);
    const minChannel = Math.min(red, green, blue);
    const isNearWhite = maxChannel >= backgroundThreshold && (maxChannel - minChannel) <= colorVariance;

    if (isNearWhite) {
      data[index + 3] = 0;
      continue;
    }

    const pixelIndex = index / 4;
    const x = pixelIndex % canvas.width;
    const y = Math.floor(pixelIndex / canvas.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  context.putImageData(imageData, 0, 0);

  if (maxX < minX || maxY < minY) {
    return canvas.toDataURL('image/png');
  }

  const trimmedCanvas = document.createElement('canvas');
  const paddedWidth = clamp((maxX - minX + 1) + (padding * 2), 32, canvas.width);
  const paddedHeight = clamp((maxY - minY + 1) + (padding * 2), 24, canvas.height);
  trimmedCanvas.width = paddedWidth;
  trimmedCanvas.height = paddedHeight;

  const trimmedContext = trimmedCanvas.getContext('2d');
  if (!trimmedContext) {
    throw new Error('Trimmed canvas context is unavailable');
  }

  trimmedContext.clearRect(0, 0, trimmedCanvas.width, trimmedCanvas.height);
  trimmedContext.drawImage(
    canvas,
    minX,
    minY,
    maxX - minX + 1,
    maxY - minY + 1,
    padding,
    padding,
    maxX - minX + 1,
    maxY - minY + 1
  );

  return trimmedCanvas.toDataURL('image/png');
};
