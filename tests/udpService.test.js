import { describe, it, expect, vi } from 'vitest';
import dgram from 'dgram';
import { udpService } from '../electron/udpService.js';

describe('udpService - Transport & Mock Board Discovery', () => {
  it('discovers board on local mock UDP echo socket', async () => {
    // 1. Create mock board UDP socket on port 5000 (or ephemeral test port 5999)
    const mockBoardPort = 5999;
    const mockBoard = dgram.createSocket('udp4');

    await new Promise((resolve) => {
      mockBoard.bind(mockBoardPort, '127.0.0.1', () => {
        resolve();
      });
    });

    mockBoard.on('message', (msg, rinfo) => {
      // If received 6-byte ping [0x01, 0x06, 0x01, 0x00, 0x00, 0x00], reply with PingResponse
      if (msg.length >= 6 && msg[0] === 0x01 && msg[1] === 0x06) {
        const reply = Buffer.from([0x01, 0x06, msg[2], msg[3], 0x00, 0x00]);
        mockBoard.send(reply, 0, reply.length, rinfo.port, rinfo.address);
      }
    });

    // 2. Run discoverBoard targeting 127.0.0.1 on test port 5999
    const progressLogs = [];
    const result = await udpService.discoverBoard('127.0.0.1', mockBoardPort, 2000, (p) => {
      progressLogs.push(p);
    });

    // 3. Verify discovery result
    expect(result.success).toBe(true);
    expect(result.ip).toBe('127.0.0.1');
    expect(progressLogs.length).toBeGreaterThan(0);

    // Cleanup
    mockBoard.close();
  });

  it('handles discovery timeout when no device responds', async () => {
    // Probe non-existent port 5998 on localhost
    const result = await udpService.discoverBoard('127.0.0.1', 5998, 400);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
