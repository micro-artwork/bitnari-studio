import { describe, it, expect } from 'vitest';
import { cobsEncode, cobsDecode, WindRpcClient, RPC_ID } from '../src/lib/windrpc/WindRpcClient.js';

describe('WindRPC Protocol & Framing', () => {
  describe('COBS Framing (Consistent Overhead Byte Stuffing)', () => {
    it('encodes and decodes simple byte buffers with zero delimiters', () => {
      const original = new Uint8Array([0x01, 0x00, 0x02, 0x00, 0x03, 0x04]);
      const encoded = cobsEncode(original);

      // Encoded frame should not contain 0x00 bytes internally
      for (let i = 0; i < encoded.length; i++) {
        expect(encoded[i]).not.toBe(0x00);
      }

      const decoded = cobsDecode(encoded);
      expect(decoded).toEqual(original);
    });

    it('encodes and decodes packet with no zeros', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const encoded = cobsEncode(original);
      const decoded = cobsDecode(encoded);
      expect(decoded).toEqual(original);
    });

    it('encodes and decodes all zeros packet', () => {
      const original = new Uint8Array([0, 0, 0, 0]);
      const encoded = cobsEncode(original);
      const decoded = cobsDecode(encoded);
      expect(decoded).toEqual(original);
    });

    it('handles large 255+ byte payloads crossing COBS 0xFF block boundary', () => {
      const original = new Uint8Array(512);
      for (let i = 0; i < 512; i++) {
        original[i] = (i % 250) + 1; // Non-zero sequences
      }
      const encoded = cobsEncode(original);
      const decoded = cobsDecode(encoded);
      expect(decoded).toEqual(original);
    });
  });

  describe('WindRPC 6-Byte Binary Header', () => {
    it('builds valid 6-byte Little-Endian header [RPC_ID(2B)][SEQ_ID(2B)][LEN(2B)] via buildRawFrame', () => {
      const client = new WindRpcClient();
      const payload = new Uint8Array([0xAA, 0xBB, 0xCC]);
      const rpcId = RPC_ID.COMMON_PING; // 0x0601

      const frame = client.buildRawFrame(rpcId, payload);
      expect(frame.length).toBe(6 + 3);

      // RPC_ID Little Endian: 0x0601 -> [0x01, 0x06]
      expect(frame[0]).toBe(0x01);
      expect(frame[1]).toBe(0x06);

      // SEQ_ID Little Endian: 1 -> [0x01, 0x00]
      expect(frame[2]).toBe(0x01);
      expect(frame[3]).toBe(0x00);

      // PAYLOAD_LEN Little Endian: 3 -> [0x03, 0x00]
      expect(frame[4]).toBe(0x03);
      expect(frame[5]).toBe(0x00);

      // Payload bytes
      expect(frame.slice(6)).toEqual(payload);
    });

    it('dispatches request and matches response via receiveRawDatagram', async () => {
      const client = new WindRpcClient();
      let sentFrame = null;

      // Mock transport function
      const mockTransport = (frame) => {
        sentFrame = frame;
        // Simulate immediate MCU response: Echo with same seqId, return empty response payload
        setTimeout(() => {
          const responseFrame = new Uint8Array([
            0x01, 0x06, // RPC_ID (0x0601)
            frame[2], frame[3], // Echo Sequence ID
            0x00, 0x00 // Payload Len: 0
          ]);
          client.receiveRawDatagram(responseFrame);
        }, 10);
      };

      const response = await client.sendRequest(RPC_ID.COMMON_PING, new Uint8Array(0), mockTransport, 1000);
      expect(response).toBeDefined();
      expect(sentFrame).toBeDefined();
    });
  });
});
