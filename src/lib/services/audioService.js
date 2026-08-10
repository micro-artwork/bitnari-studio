/**
 * Audio Spectrum Analysis & Visualizer Service for Bitnari
 * Uses Electron Desktop Capturer & WASAPI System Audio Loopback.
 * Captures PC Desktop Audio Output (Speaker/Game/USB DAC) and Microphones cleanly.
 */

let audioCtx = null;
let analyser = null;
let mediaStream = null;
let sourceNode = null;
let freqData = null;

/**
 * Enumerate all available audio input devices (Microphones, Stereo Mix, Line-In)
 */
export async function getAudioInputDevices() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({
        id: d.deviceId,
        label: d.label || `Audio Device (${d.deviceId.slice(0, 8)})`,
      }));
  } catch (err) {
    console.warn('[AudioService] Failed to enumerate audio devices:', err);
    return [];
  }
}

export async function initAudioCapture(
  audioSource = 'SystemAudio',
  deviceId = '',
) {
  try {
    stopAudioCapture();

    console.log(
      `[AudioService] Initializing Audio Capture (Source: ${audioSource}, DeviceId: ${deviceId || 'default'})...`,
    );

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    if (deviceId && deviceId.trim() !== '') {
      // Target specific Microphone/Stereo Mix device ID
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        });
      } catch (e) {
        console.warn(
          '[AudioService] Specific deviceId capture failed, falling back to default:',
          e.message,
        );
      }
    }

    if (!mediaStream && audioSource === 'Microphone') {
      // Capture default microphone input
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
    } else if (!mediaStream) {
      // Capture PC Desktop Audio Output (Speaker / Game / USB DAC sound loopback)
      try {
        // Fetch Electron Desktop Capturer screen source ID
        let screenSourceId = 'screen:0:0';
        if (window.api && window.api.getScreenSources) {
          const sources = await window.api.getScreenSources();
          if (sources && sources.length > 0) {
            screenSourceId = sources[0].id;
          }
        }

        console.log(
          `[AudioService] Requesting Electron WASAPI Desktop Audio Loopback (SourceID: ${screenSourceId})...`,
        );

        // Electron Desktop Media Capture Constraints
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: screenSourceId,
            },
          },
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: screenSourceId,
            },
          },
        });
      } catch (err) {
        console.warn(
          '[AudioService] Electron WASAPI Desktop Loopback failed, trying getDisplayMedia:',
          err.message,
        );
        try {
          mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
        } catch (err2) {
          console.warn(
            '[AudioService] getDisplayMedia failed, falling back to default audio input:',
            err2.message,
          );
          mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
        }
      }
    }

    if (!mediaStream) {
      throw new Error('Failed to create media stream');
    }

    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn(
        '[AudioService] No audio track found in captured stream, attempting microphone fallback...',
      );
      // Robust Fallback: getUserMedia audio
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    }

    const activeAudioTrack = mediaStream.getAudioTracks()[0];
    if (!activeAudioTrack) {
      throw new Error('No active audio track available in system stream');
    }

    console.log(
      '[AudioService] Successfully attached Audio Track:',
      activeAudioTrack.label || 'System Loopback',
    );

    // Stop video tracks to save GPU/CPU resources
    mediaStream.getVideoTracks().forEach((track) => {
      console.log(
        '[AudioService] Disabling unused screen video track:',
        track.label,
      );
      track.stop();
    });

    // Create audio-only stream for Web Audio API AnalyserNode
    const audioOnlyStream = new MediaStream([activeAudioTrack]);

    sourceNode = audioCtx.createMediaStreamSource(audioOnlyStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256; // 128 frequency bins
    analyser.smoothingTimeConstant = 0.7;

    sourceNode.connect(analyser);
    freqData = new Uint8Array(analyser.frequencyBinCount);

    console.log(
      `[AudioService] Audio spectrum engine initialized! Bins: ${analyser.frequencyBinCount}`,
    );
    return true;
  } catch (err) {
    console.warn(
      '[AudioService] Audio capture initialization failed:',
      err.message,
    );
    stopAudioCapture();
    return false;
  }
}

let bassAvgTracker = 0.2;
let midAvgTracker = 0.25;
let trebleAvgTracker = 0.1;

export function stopAudioCapture() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  if (sourceNode) {
    try {
      sourceNode.disconnect();
    } catch (e) {}
    sourceNode = null;
  }
  analyser = null;
  if (audioCtx && audioCtx.state !== 'closed') {
    try {
      audioCtx.close();
    } catch (e) {}
    audioCtx = null;
  }
  freqData = null;
  bassAvgTracker = 0.2;
  midAvgTracker = 0.25;
  trebleAvgTracker = 0.1;
}

export function getAudioAnalysis(sensitivity = 1.5) {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  if (!analyser || !freqData) {
    return {
      bass: 0,
      mid: 0,
      treble: 0,
      volume: 0,
      freqData: new Uint8Array(0),
    };
  }

  analyser.getByteFrequencyData(freqData);

  const binCount = freqData.length;
  // Bins mapping (0-128 for 24kHz spectrum)
  const bassBins = Math.max(1, Math.floor(binCount * 0.12)); // ~0-250Hz (Sub-bass & Bass)
  const midBins = Math.max(bassBins + 1, Math.floor(binCount * 0.45)); // ~250Hz-4kHz (Mids & Vocals)

  let bassSum = 0;
  for (let i = 0; i < bassBins; i++) {
    bassSum += freqData[i];
  }
  const rawBass = bassSum / (bassBins * 255);

  let midSum = 0;
  for (let i = bassBins; i < midBins; i++) {
    midSum += freqData[i];
  }
  const rawMid = midSum / ((midBins - bassBins) * 255);

  let trebleSum = 0;
  for (let i = midBins; i < binCount; i++) {
    trebleSum += freqData[i];
  }
  const rawTreble = trebleSum / ((binCount - midBins) * 255);

  // Dynamic AGC Auto-Centering (Exponential Moving Average Peak Tracker)
  bassAvgTracker = bassAvgTracker * 0.96 + rawBass * 0.04;
  midAvgTracker = midAvgTracker * 0.96 + rawMid * 0.04;
  trebleAvgTracker = trebleAvgTracker * 0.96 + rawTreble * 0.04;

  const bassGain = 0.5 / Math.max(0.04, bassAvgTracker);
  const midGain = 0.5 / Math.max(0.04, midAvgTracker);
  const trebleGain = 0.5 / Math.max(0.04, trebleAvgTracker);

  const userSens = sensitivity / 1.5;
  const bass = Math.min(1.0, rawBass * bassGain * userSens);
  const mid = Math.min(1.0, rawMid * midGain * userSens);
  const treble = Math.min(1.0, rawTreble * trebleGain * userSens);

  let totalSum = 0;
  for (let i = 0; i < binCount; i++) {
    totalSum += freqData[i];
  }
  const volume = Math.min(1.0, (totalSum / (binCount * 255)) * sensitivity);

  return { bass, mid, treble, volume, freqData };
}
