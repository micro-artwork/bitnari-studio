/**
 * Bitnari Application Configuration Store (Svelte 5 $state)
 * Auto-persists control settings and supports user configuration profiles/presets.
 */

const STORAGE_KEY = 'bitnari_app_config_v1';
const PROFILES_KEY = 'bitnari_profiles_v1';

class AppConfigStore {
  // 1. Connection & Power Status (Transient runtime states)
  connectionType = $state('USB-CDC'); // 'USB-CDC' | 'BLE'
  isConnected = $state(false);
  isRunning = $state(false);
  selectedPort = $state('');
  availablePorts = $state([]);

  // BLE Specific State
  selectedBleAddress = $state('');
  availableBleDevices = $state([]);
  isBleScanning = $state(false);
  bleNameFilter = $state('BITNARI');

  // UDP Specific State
  targetUdpIp = $state('192.168.1.119');
  targetUdpPort = $state(5000);

  // 2. Synchronization Mode & Pipeline
  syncMode = $state('ScreenSync'); // 'ScreenSync' | 'AudioSync' | 'MoodLight'
  screenCaptureMethod = $state('DXGI'); // 'DXGI' | 'GDI'
  selectedScreenId = $state('');
  screenRotation = $state(0); // 0 | 90 | 180 | 270 degrees
  availableScreens = $state([]);
  captureFrameRate = $state(30);
  livePreview = $state(true);
  hdrToneMapping = $state(true);
  autoLetterbox = $state(true);

  // 2.1 Mood Light Options
  moodPreset = $state('WarmWhite'); // 'WarmWhite' | 'Cyberpunk' | 'Sunset' | 'Forest' | 'Ocean' | 'Rainbow' | 'Custom'
  moodEffect = $state('Breathing'); // 'Static' | 'Breathing' | 'RainbowCycle'
  moodColor = $state('#ffb74d'); // Custom HEX color
  moodSpeed = $state(1.0);
  moodFrameRate = $state(30);

  // 2.2 Audio Rhythm Sync Options
  audioSource = $state('SystemAudio'); // 'SystemAudio' | 'Microphone'
  selectedAudioDeviceId = $state('');
  availableAudioDevices = $state([]);
  audioSensitivity = $state(1.5);
  audioPalette = $state('Party'); // 'Party' | 'Neon' | 'Fire' | 'Ocean'
  audioFrameRate = $state(60);
  audioStereoMode = $state(true); // Stereo Spatial Left/Right audio channel separation

  // 3. LED Layout & Geometry
  topPixels = $state(58);
  bottomPixels = $state(58);
  leftPixels = $state(33);
  rightPixels = $state(33);

  topAvailable = $state(true);
  bottomAvailable = $state(true);
  leftAvailable = $state(true);
  rightAvailable = $state(true);

  topBlank = $state(false);
  bottomBlank = $state(false);
  leftBlank = $state(false);
  rightBlank = $state(false);

  startPoint = $state('TopLeft'); // 'TopLeft' | 'TopRight' | 'BottomLeft' | 'BottomRight'
  rotationDirection = $state('Clockwise'); // 'Clockwise' | 'CounterClockwise'

  // 4. Power & Protection
  powerMode = $state('Static'); // 'Static' | 'Adaptive'
  brightnessPercent = $state(85);
  adaptiveMaxPowerW = $state(30);
  redMaxPowerW = $state(0.08);
  greenMaxPowerW = $state(0.08);
  blueMaxPowerW = $state(0.08);
  powerProtectionEnabled = $state(true);
  powerProtectionWatt = $state(100);

  // 5. Color Tuning & Gamma
  gammaEnabled = $state(true);
  gammaR = $state(1.0);
  gammaG = $state(1.0);
  gammaB = $state(1.0);
  saturationBoost = $state(1.35);
  smoothingFactor = $state(0.25);

  // 6. Profiles & Presets Management
  activeProfileName = $state('Default');
  savedProfiles = $state({});

  constructor() {
    this.loadConfig();
    this.loadProfiles();
  }

  // Derived total pixel count (only counts Available / Enabled LED strips)
  get totalPixels() {
    const top = this.topAvailable ? this.topPixels : 0;
    const bottom = this.bottomAvailable ? this.bottomPixels : 0;
    const left = this.leftAvailable ? this.leftPixels : 0;
    const right = this.rightAvailable ? this.rightPixels : 0;
    return top + bottom + left + right;
  }

  // Derived estimated max wattage
  get estimatedMaxWatt() {
    return (
      this.totalPixels *
      (this.redMaxPowerW + this.greenMaxPowerW + this.blueMaxPowerW)
    ).toFixed(1);
  }

  getSnapshot() {
    return {
      syncMode: this.syncMode,
      screenCaptureMethod: this.screenCaptureMethod,
      selectedScreenId: this.selectedScreenId,
      screenRotation: this.screenRotation,
      captureFrameRate: this.captureFrameRate,
      livePreview: this.livePreview,
      hdrToneMapping: this.hdrToneMapping,
      autoLetterbox: this.autoLetterbox,

      moodPreset: this.moodPreset,
      moodEffect: this.moodEffect,
      moodColor: this.moodColor,
      moodSpeed: this.moodSpeed,
      moodFrameRate: this.moodFrameRate,

      audioSource: this.audioSource,
      selectedAudioDeviceId: this.selectedAudioDeviceId,
      audioSensitivity: this.audioSensitivity,
      audioPalette: this.audioPalette,
      audioFrameRate: this.audioFrameRate,
      audioStereoMode: this.audioStereoMode,

      topPixels: this.topPixels,
      bottomPixels: this.bottomPixels,
      leftPixels: this.leftPixels,
      rightPixels: this.rightPixels,

      topAvailable: this.topAvailable,
      bottomAvailable: this.bottomAvailable,
      leftAvailable: this.leftAvailable,
      rightAvailable: this.rightAvailable,

      topBlank: this.topBlank,
      bottomBlank: this.bottomBlank,
      leftBlank: this.leftBlank,
      rightBlank: this.rightBlank,

      startPoint: this.startPoint,
      rotationDirection: this.rotationDirection,

      powerMode: this.powerMode,
      redMaxPowerW: this.redMaxPowerW,
      greenMaxPowerW: this.greenMaxPowerW,
      blueMaxPowerW: this.blueMaxPowerW,
      brightnessPercent: this.brightnessPercent,
      adaptiveMaxPowerW: this.adaptiveMaxPowerW,
      powerProtectionEnabled: this.powerProtectionEnabled,
      powerProtectionWatt: this.powerProtectionWatt,

      gammaEnabled: this.gammaEnabled,
      gammaR: this.gammaR,
      gammaG: this.gammaG,
      gammaB: this.gammaB,
      saturationBoost: this.saturationBoost,
      smoothingFactor: this.smoothingFactor,

      targetUdpIp: this.targetUdpIp,
      targetUdpPort: this.targetUdpPort,
    };
  }

  applySnapshot(data) {
    if (!data) return;
    if (data.targetUdpIp !== undefined) this.targetUdpIp = data.targetUdpIp;
    if (data.targetUdpPort !== undefined) this.targetUdpPort = data.targetUdpPort;
    if (data.syncMode !== undefined) this.syncMode = data.syncMode;
    if (data.screenCaptureMethod !== undefined)
      this.screenCaptureMethod = data.screenCaptureMethod;
    if (data.selectedScreenId !== undefined)
      this.selectedScreenId = data.selectedScreenId;
    if (data.screenRotation !== undefined)
      this.screenRotation = data.screenRotation;
    if (data.captureFrameRate !== undefined)
      this.captureFrameRate = data.captureFrameRate;
    if (data.livePreview !== undefined) this.livePreview = data.livePreview;
    if (data.hdrToneMapping !== undefined)
      this.hdrToneMapping = data.hdrToneMapping;
    if (data.autoLetterbox !== undefined)
      this.autoLetterbox = data.autoLetterbox;

    if (data.moodPreset !== undefined) this.moodPreset = data.moodPreset;
    if (data.moodEffect !== undefined) this.moodEffect = data.moodEffect;
    if (data.moodColor !== undefined) this.moodColor = data.moodColor;
    if (data.moodSpeed !== undefined) this.moodSpeed = data.moodSpeed;
    if (data.moodFrameRate !== undefined)
      this.moodFrameRate = data.moodFrameRate;

    if (data.audioSource !== undefined) this.audioSource = data.audioSource;
    if (data.selectedAudioDeviceId !== undefined)
      this.selectedAudioDeviceId = data.selectedAudioDeviceId;
    if (data.audioSensitivity !== undefined)
      this.audioSensitivity = data.audioSensitivity;
    if (data.audioPalette !== undefined) this.audioPalette = data.audioPalette;
    if (data.audioFrameRate !== undefined)
      this.audioFrameRate = data.audioFrameRate;
    if (data.audioStereoMode !== undefined)
      this.audioStereoMode = data.audioStereoMode;

    if (data.topPixels !== undefined) this.topPixels = data.topPixels;
    if (data.bottomPixels !== undefined) this.bottomPixels = data.bottomPixels;
    if (data.leftPixels !== undefined) this.leftPixels = data.leftPixels;
    if (data.rightPixels !== undefined) this.rightPixels = data.rightPixels;

    if (data.topAvailable !== undefined) this.topAvailable = data.topAvailable;
    if (data.bottomAvailable !== undefined)
      this.bottomAvailable = data.bottomAvailable;
    if (data.leftAvailable !== undefined)
      this.leftAvailable = data.leftAvailable;
    if (data.rightAvailable !== undefined)
      this.rightAvailable = data.rightAvailable;

    if (data.topBlank !== undefined) this.topBlank = data.topBlank;
    if (data.bottomBlank !== undefined) this.bottomBlank = data.bottomBlank;
    if (data.leftBlank !== undefined) this.leftBlank = data.leftBlank;
    if (data.rightBlank !== undefined) this.rightBlank = data.rightBlank;

    if (data.startPoint !== undefined) this.startPoint = data.startPoint;
    if (data.rotationDirection !== undefined)
      this.rotationDirection = data.rotationDirection;

    if (data.powerMode !== undefined) this.powerMode = data.powerMode;
    if (data.redMaxPowerW !== undefined) this.redMaxPowerW = data.redMaxPowerW;
    if (data.greenMaxPowerW !== undefined)
      this.greenMaxPowerW = data.greenMaxPowerW;
    if (data.blueMaxPowerW !== undefined)
      this.blueMaxPowerW = data.blueMaxPowerW;
    if (data.brightnessPercent !== undefined)
      this.brightnessPercent = data.brightnessPercent;
    if (data.adaptiveMaxPowerW !== undefined)
      this.adaptiveMaxPowerW = data.adaptiveMaxPowerW;
    if (data.powerProtectionEnabled !== undefined)
      this.powerProtectionEnabled = data.powerProtectionEnabled;
    if (data.powerProtectionWatt !== undefined)
      this.powerProtectionWatt = data.powerProtectionWatt;

    if (data.gammaEnabled !== undefined) this.gammaEnabled = data.gammaEnabled;
    if (data.gammaR !== undefined) this.gammaR = data.gammaR;
    if (data.gammaG !== undefined) this.gammaG = data.gammaG;
    if (data.gammaB !== undefined) this.gammaB = data.gammaB;
    if (data.saturationBoost !== undefined)
      this.saturationBoost = data.saturationBoost;
    if (data.smoothingFactor !== undefined)
      this.smoothingFactor = data.smoothingFactor;
  }

  loadConfig() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.selectedPort !== undefined)
        this.selectedPort = data.selectedPort;
      if (data.activeProfileName !== undefined)
        this.activeProfileName = data.activeProfileName;
      this.applySnapshot(data);
      this.connectionType = 'USB-CDC'; // Temporarily force USB-CDC in UI
      console.log('[ConfigStore] Active configuration loaded!');
    } catch (err) {
      console.error('[ConfigStore] Failed to load config:', err);
    }
  }

  saveConfig() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const data = {
        selectedPort: this.selectedPort,
        activeProfileName: this.activeProfileName,
        ...this.getSnapshot(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('[ConfigStore] Failed to auto-save config:', err);
    }
  }

  loadProfiles() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      let profilesObj = {};
      if (raw) {
        profilesObj = JSON.parse(raw);
      }

      // Ensure built-in presets exist if empty
      if (!profilesObj['Default']) {
        profilesObj['Default'] = this.getSnapshot();
      }
      if (!profilesObj['Gaming 60Hz High-Sat']) {
        profilesObj['Gaming 60Hz High-Sat'] = {
          ...this.getSnapshot(),
          captureFrameRate: 60,
          saturationBoost: 1.55,
          powerMode: 'Static',
          brightnessPercent: 100,
        };
      }
      if (!profilesObj['Cinema Movie Night']) {
        profilesObj['Cinema Movie Night'] = {
          ...this.getSnapshot(),
          captureFrameRate: 30,
          autoLetterbox: true,
          saturationBoost: 1.25,
          powerMode: 'Adaptive',
          adaptiveMaxPowerW: 25,
          smoothingFactor: 0.15,
        };
      }

      this.savedProfiles = profilesObj;
    } catch (err) {
      console.error('[ConfigStore] Failed to load profiles:', err);
    }
  }

  saveProfiles() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(PROFILES_KEY, JSON.stringify(this.savedProfiles));
    } catch (err) {
      console.error('[ConfigStore] Failed to save profiles:', err);
    }
  }

  createProfile(profileName) {
    if (!profileName || !profileName.trim()) return false;
    const name = profileName.trim();
    const newProfiles = { ...this.savedProfiles };
    newProfiles[name] = this.getSnapshot();
    this.savedProfiles = newProfiles;
    this.activeProfileName = name;
    this.saveProfiles();
    this.saveConfig();
    console.log(`[ConfigStore] Saved current settings as profile: "${name}"`);
    return true;
  }

  loadProfile(profileName) {
    if (!this.savedProfiles[profileName]) return false;
    this.applySnapshot(this.savedProfiles[profileName]);
    this.activeProfileName = profileName;
    this.saveConfig();
    console.log(`[ConfigStore] Applied profile: "${profileName}"`);
    return true;
  }

  deleteProfile(profileName) {
    if (
      !profileName ||
      profileName === 'Default' ||
      !this.savedProfiles[profileName]
    )
      return false;
    const newProfiles = { ...this.savedProfiles };
    delete newProfiles[profileName];
    this.savedProfiles = newProfiles;

    if (this.activeProfileName === profileName) {
      this.activeProfileName = 'Default';
      this.loadProfile('Default');
    } else {
      this.saveProfiles();
    }
    return true;
  }
}

export const configStore = new AppConfigStore();
