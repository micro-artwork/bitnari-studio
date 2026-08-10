/**
 * Screen Capture & Perimeter Color Extraction Service for Bitnari
 * Ported 1:1 from C# HilightBoxWinForm ImageUtil.cs LED geometry & rotation mapping.
 */

let mediaStream = null;
let videoElem = null;
let canvasElem = null;
let canvasCtx = null;
let animAngle = 0;
let currentScreenId = '';

/**
 * 1:1 Port of C# ImageUtil.cs GetPositionsAndDirections()
 * Calculates edge order and sampling direction for 4 corners & 2 rotation directions.
 */
export function getPositionsAndDirections(
  startPoint = 'TopLeft',
  rotationDirection = 'Clockwise',
) {
  let positions = [];
  let arrayDirections = [];

  switch (startPoint) {
    case 'TopRight':
      positions = ['Right', 'Bottom', 'Left', 'Top'];
      arrayDirections = [true, false, false, true];
      break;
    case 'BottomRight':
      positions = ['Bottom', 'Left', 'Top', 'Right'];
      arrayDirections = [false, false, true, true];
      break;
    case 'BottomLeft':
      positions = ['Left', 'Top', 'Right', 'Bottom'];
      arrayDirections = [false, true, true, false];
      break;
    case 'TopLeft':
    default:
      positions = ['Top', 'Right', 'Bottom', 'Left'];
      arrayDirections = [true, true, false, false];
      break;
  }

  if (rotationDirection === 'CounterClockwise') {
    positions.reverse();
    arrayDirections.reverse();
    arrayDirections = arrayDirections.map((val) => !val);
  }

  return { positions, arrayDirections };
}

export async function initScreenCapture(targetScreenId = '') {
  try {
    if (mediaStream) {
      if (!targetScreenId || currentScreenId === targetScreenId) return true;
      stopScreenCapture();
    }

    console.log(
      '[ScreenCapture] Initializing native screen capture for screenId:',
      targetScreenId || 'default',
    );

    // 1. Try desktopCapturer via Electron API (Native Electron Desktop Media)
    if (window.api && window.api.getScreenSources) {
      try {
        const sources = await window.api.getScreenSources();
        console.log('[ScreenCapture] Electron screen sources found:', sources);
        if (sources && sources.length > 0) {
          const selectedSource =
            sources.find((s) => s.id === targetScreenId) || sources[0];
          currentScreenId = selectedSource.id;

          mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: selectedSource.id,
                minFrameRate: 30,
                maxFrameRate: 60,
              },
            },
          });
        }
      } catch (err) {
        console.warn(
          '[ScreenCapture] getUserMedia with chromeMediaSourceId failed:',
          err.message,
        );
      }
    }

    // 2. Fallback to standard getDisplayMedia
    if (
      !mediaStream &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getDisplayMedia
    ) {
      try {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'never', frameRate: { ideal: 60 } },
          audio: false,
        });
      } catch (err) {
        console.warn(
          '[ScreenCapture] getDisplayMedia fallback failed:',
          err.message,
        );
      }
    }

    if (!mediaStream) {
      throw new Error('No media stream available for screen capture');
    }

    videoElem = document.createElement('video');
    videoElem.autoplay = true;
    videoElem.srcObject = mediaStream;
    await videoElem.play();

    canvasElem = document.createElement('canvas');
    canvasCtx = canvasElem.getContext('2d', { willReadFrequently: true });
    console.log(
      '[ScreenCapture] Screen capture stream successfully started for screen:',
      currentScreenId,
    );
    return true;
  } catch (err) {
    console.warn(
      '[ScreenCapture] Screen capture initialization failed:',
      err.message,
    );
    mediaStream = null;
    currentScreenId = '';
    return false;
  }
}

export function stopScreenCapture() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  if (videoElem) {
    videoElem.pause();
    videoElem.srcObject = null;
    videoElem = null;
  }
  canvasElem = null;
  canvasCtx = null;
  currentScreenId = '';
}

export function sampleScreenColors(totalPixels = 182, config = {}) {
  if (typeof totalPixels === 'object' && totalPixels !== null) {
    config = totalPixels;
    totalPixels =
      (config.topPixels || 58) +
      (config.bottomPixels || 58) +
      (config.leftPixels || 33) +
      (config.rightPixels || 33);
  }
  const rawColors = [];
  const { startPoint = 'TopLeft', rotationDirection = 'Clockwise' } = config;
  const { positions, arrayDirections } = getPositionsAndDirections(
    startPoint,
    rotationDirection,
  );

  const edgePixels = {
    Top: (config.topAvailable ?? true) ? config.topPixels || 0 : 0,
    Right: (config.rightAvailable ?? true) ? config.rightPixels || 0 : 0,
    Bottom: (config.bottomAvailable ?? true) ? config.bottomPixels || 0 : 0,
    Left: (config.leftAvailable ?? true) ? config.leftPixels || 0 : 0,
  };

  const edgeBlanks = {
    Top: config.topBlank || false,
    Right: config.rightBlank || false,
    Bottom: config.bottomBlank || false,
    Left: config.leftBlank || false,
  };

  const isMediaActive = videoElem && videoElem.readyState >= 2 && canvasCtx;
  const width = isMediaActive ? videoElem.videoWidth || 1920 : 1920;
  const height = isMediaActive ? videoElem.videoHeight || 1080 : 1080;

  if (isMediaActive) {
    if (videoElem.paused) {
      videoElem.play().catch(() => {});
    }
    if (canvasElem.width !== width || canvasElem.height !== height) {
      canvasElem.width = width;
      canvasElem.height = height;
    }
    canvasCtx.drawImage(videoElem, 0, 0, width, height);
  }

  const frameData = isMediaActive
    ? canvasCtx.getImageData(0, 0, width, height).data
    : null;

  // Iterate through the 4 edges in configured position order
  for (let i = 0; i < 4; i++) {
    const pos = positions[i];
    const isForward = arrayDirections[i];
    const count = edgePixels[pos] || 0;
    const isBlank = edgeBlanks[pos];

    for (let j = 0; j < count; j++) {
      if (isBlank) {
        rawColors.push({ r: 0, g: 0, b: 0 });
        continue;
      }

      // Direction index: if forward 0 -> count-1; if reverse count-1 -> 0
      const idx = isForward ? j : count - 1 - j;
      const ratio = (idx + 0.5) / count;

      let unrotatedX = 0,
        unrotatedY = 0;
      if (pos === 'Top') {
        unrotatedX = Math.floor(ratio * width);
        unrotatedY = Math.floor(height * 0.05);
      } else if (pos === 'Right') {
        unrotatedX = Math.floor(width * 0.95);
        unrotatedY = Math.floor(ratio * height);
      } else if (pos === 'Bottom') {
        unrotatedX = Math.floor(ratio * width);
        unrotatedY = Math.floor(height * 0.95);
      } else if (pos === 'Left') {
        unrotatedX = Math.floor(width * 0.05);
        unrotatedY = Math.floor(ratio * height);
      }

      // Apply Display Rotation Angle Transformation (0, 90, 180, 270)
      let x = unrotatedX;
      let y = unrotatedY;
      const rot = (config.screenRotation || 0) % 360;

      if (rot === 90) {
        x = Math.floor(width - 1 - unrotatedY * (width / height));
        y = Math.floor(unrotatedX * (height / width));
      } else if (rot === 180) {
        x = width - 1 - unrotatedX;
        y = height - 1 - unrotatedY;
      } else if (rot === 270) {
        x = Math.floor(unrotatedY * (width / height));
        y = Math.floor(height - 1 - unrotatedX * (height / width));
      }

      x = Math.max(0, Math.min(width - 1, x));
      y = Math.max(0, Math.min(height - 1, y));

      if (isMediaActive && frameData) {
        const pixelIdx = (y * width + x) * 4;
        rawColors.push({
          r: frameData[pixelIdx],
          g: frameData[pixelIdx + 1],
          b: frameData[pixelIdx + 2],
        });
      } else {
        // Dynamic rainbow fallback for animation preview
        animAngle = (animAngle + 0.0005) % (Math.PI * 2);
        const globalLedIndex = rawColors.length;
        const hue =
          ((globalLedIndex / (totalPixels || 182)) * 360 + animAngle * 50) %
          360;
        rawColors.push(hslToRgb(hue / 360, 0.9, 0.5));
      }
    }
  }

  return rawColors;
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * Enforces absolute 0x000000 (blackout) on sides configured as Blank
 */
export function applyBlankMask(colors = [], config = {}) {
  if (!colors || colors.length === 0) return [];

  const {
    startPoint = 'TopLeft',
    rotationDirection = 'Clockwise',
    topAvailable = true,
    rightAvailable = true,
    bottomAvailable = true,
    leftAvailable = true,
    topPixels = 58,
    rightPixels = 33,
    bottomPixels = 58,
    leftPixels = 33,
    topBlank = false,
    rightBlank = false,
    bottomBlank = false,
    leftBlank = false,
  } = config;

  const { positions } = getPositionsAndDirections(
    startPoint,
    rotationDirection,
  );

  const edgePixels = {
    Top: (topAvailable ?? true) ? topPixels || 0 : 0,
    Right: (rightAvailable ?? true) ? rightPixels || 0 : 0,
    Bottom: (bottomAvailable ?? true) ? bottomPixels || 0 : 0,
    Left: (leftAvailable ?? true) ? leftPixels || 0 : 0,
  };

  const edgeBlanks = {
    Top: topBlank || false,
    Right: rightBlank || false,
    Bottom: bottomBlank || false,
    Left: leftBlank || false,
  };

  let currentIndex = 0;
  const maskedColors = colors.map((c) => ({ ...c }));

  for (let i = 0; i < 4; i++) {
    const pos = positions[i];
    const count = edgePixels[pos] || 0;
    const isBlank = edgeBlanks[pos];

    if (isBlank) {
      for (let j = 0; j < count; j++) {
        if (currentIndex + j < maskedColors.length) {
          maskedColors[currentIndex + j] = { r: 0, g: 0, b: 0 };
        }
      }
    }
    currentIndex += count;
  }

  return maskedColors;
}
