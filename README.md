[한국어 (Korean)](README_kr.md)

# Bitnari Studio

Bitnari Studio is the desktop control application for the Bitnari Project, an open-source ambient light system designed for PC environments.

'Bitnari' originates from the Korean word '빛나리' (meaning 'shining' or 'will shine').

<p align="center">
  <img src="docs/demo.png" width="100%" alt="Bitnari Studio Demo Preview">
</p>

---

## System Architecture

The Bitnari system consists of two main sub-projects: `Bitnari Studio` (the desktop control application) and `Bitnari LED` (the LED strip controller hardware). WindRPC is used as the communication mechanism between the two.

### 1. Bitnari Studio (Electron Desktop App)

_This repository._

An ambient light control application built with [Electron](https://www.electronjs.org/) and [SvelteKit](https://kit.svelte.dev/). It captures screen edge colors or analyzes system audio spectrums in real time to generate dynamic pixel data, streaming it to the controller hardware via the WindRPC protocol.

### 2. [Bitnari LED](https://github.com/micro-artwork/bitnari-led) (LED Strip Control H/W)

A hardware controller powered by the Raspberry Pi Pico series (RP2040, RP2350, etc.) and [Zephyr RTOS](https://zephyrproject.org/). It receives pixel data from PC in real time and renders it asynchronously to LED strips such as WS2812.

### 3. [WindRPC](https://github.com/micro-artwork/windrpc) (Micro Interconnect & Network Dispatch RPC)

Implements a lightweight RPC framework based on NanoPB and Protocol Buffers to ensure a seamless communication mechanism and maintainability between Bitnari Studio and Bitnari LED.
This repository includes a JavaScript/TypeScript-based WindRPC client SDK.

---

## Key Features

- Real-Time Screen Sync (Screen Capture & HDR Mapping)
  - Captures display edge colors to stream dynamic ambient lighting effects.
- Audio Rhythm Visualizer
  - Supports spectrum analysis for system audio output response.
- 3D Interactive Preview
  - Provides a 3D visualization preview of screen and LED strip layouts.
- Multi-Channel Transport Support (USB Serial / Wi-Fi UDP)
  - Supports USB Serial (COBS framing) and network (Wi-Fi UDP) transmission.
- Real-Time Power Monitoring & Fault Alerts (Power Telemetry & Safety)
  - Receives real-time voltage, current, and power data from Banchak Shield, displaying over-power cutoff and fault alerts.

---

## Development & Build

### Prerequisites

- Node.js (v18+ recommended)
- npm

### Installation

```bash
# Install dependencies
npm install
```

### Run Development Mode

Runs the Electron main process and SvelteKit frontend dev server concurrently:

```bash
npm run dev
```

### Build Application

Builds the production deployment bundle:

```bash
npm run build
```

---

## Notice

### Contribution Policy

- Due to limited maintainer time for code reviews and maintenance, external pull requests from non-approved personnel are politely declined at this time. We appreciate your interest.

### Project Status

- Please note that the user interface and features are not 100% complete. Minor updates and continuous improvements will be applied over time.

---

## License

Copyright (c) 2026 Bitnari Project
This project is licensed under the MIT License.
