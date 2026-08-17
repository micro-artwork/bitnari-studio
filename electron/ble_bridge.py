#!/usr/bin/env python3
"""
Python BLE Central Bridge for Bitnari Studio Electron Application.
Uses bleak for cross-platform BLE scanning, connection, and GATT data notification handling.
Communicates with Electron Main Process using a line-based JSON protocol over stdio.
"""

import sys
import os
import json
import asyncio
import base64
import logging

try:
    from bleak import BleakScanner, BleakClient
except ImportError:
    print(json.dumps({
        "event": "error",
        "message": "bleak library is not installed. Please run: pip install bleak"
    }), flush=True)
    sys.exit(1)

# Nordic UART Service (NUS) and Custom WindRPC Service UUIDs
NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
# Write (to peripheral)
NUS_RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
# Notify (from peripheral)
NUS_TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

logging.basicConfig(level=logging.WARNING)


class BleBridge:
    def __init__(self):
        self.client = None
        self.connected_address = None
        self.rx_char = None
        self.tx_char = None

    def send_event(self, event_type, data=None):
        msg = {"event": event_type}
        if data is not None:
            if isinstance(data, dict):
                msg.update(data)
            else:
                msg["payload"] = data
        print(json.dumps(msg), flush=True)

    async def scan(self, timeout=30):
        if hasattr(self, 'scan_task') and self.scan_task and not self.scan_task.done():
            self.scan_task.cancel()
            try:
                await self.scan_task
            except Exception:
                pass

        async def _do_scan():
            discovered = {}

            def callback(device, advertising_data):
                discovered[device.address] = (device, advertising_data)
                device_list = []
                for d, adv in discovered.values():
                    service_uuids = [str(u).lower() for u in adv.service_uuids]
                    raw_name = d.name or adv.local_name
                    is_nus = NUS_SERVICE_UUID in service_uuids

                    if not raw_name or raw_name.strip() == "" or raw_name == "Unknown Device":
                        if is_nus:
                            name = "Bitnari LED Device"
                        else:
                            name = "Unknown Device"
                    else:
                        name = raw_name.strip()

                    name_lower = name.lower()
                    is_match = ("bitnari" in name_lower) or is_nus
                    device_list.append({
                        "address": d.address,
                        "name": name,
                        "rssi": adv.rssi,
                        "isBitnari": is_match
                    })
                device_list.sort(key=lambda x: (
                    not x["isBitnari"], -x["rssi"]))
                self.send_event("scan_result", {"devices": device_list})

            try:
                self.send_event(
                    "status", {"message": f"Scanning for BLE devices ({timeout}s)..."})
                async with BleakScanner(detection_callback=callback):
                    await asyncio.sleep(timeout)
            except asyncio.CancelledError:
                self.send_event("status", {"message": "Scan reset/extended."})
            except Exception as e:
                self.send_event("error", {"message": f"Scan failed: {str(e)}"})

        self.scan_task = asyncio.create_task(_do_scan())

    async def connect(self, address):
        if self.client and self.client.is_connected:
            await self.disconnect()

        self.send_event(
            "status", {"message": f"Connecting to BLE device {address}..."})
        try:
            def notification_handler(sender, data: bytearray):
                b64_data = base64.b64encode(data).decode('ascii')
                self.send_event("data", {"data": b64_data})

            def disconnected_callback(client):
                self.connected_address = None
                self.client = None
                self.rx_char = None
                self.tx_char = None
                self.send_event("disconnected", {
                                "address": address, "reason": "Connection lost"})

            self.client = BleakClient(
                address, disconnected_callback=disconnected_callback, timeout=10.0)
            connected = await self.client.connect()
            if not connected:
                self.send_event(
                    "error", {"message": f"Failed to connect to {address}"})
                return

            self.connected_address = address

            # Discover services and find NUS RX/TX characteristics
            nus_rx = None
            nus_tx = None

            for service in self.client.services:
                for char in service.characteristics:
                    char_uuid = str(char.uuid).lower()
                    if char_uuid == NUS_RX_CHAR_UUID:
                        nus_rx = char
                    elif char_uuid == NUS_TX_CHAR_UUID:
                        nus_tx = char

            # Fallback: if exact NUS UUIDs not matched, find first write/notify characteristics
            if not nus_rx or not nus_tx:
                for service in self.client.services:
                    for char in service.characteristics:
                        if not nus_rx and ("write" in char.properties or "write-without-response" in char.properties):
                            nus_rx = char
                        if not nus_tx and ("notify" in char.properties or "indicate" in char.properties):
                            nus_tx = char

            self.rx_char = nus_rx
            self.tx_char = nus_tx

            if self.tx_char:
                await self.client.start_notify(self.tx_char, notification_handler)

            mtu_size = getattr(self.client, 'mtu_size', 23)
            self.send_event("connected", {
                "address": address,
                "mtu_size": mtu_size,
                "rx_uuid": str(self.rx_char.uuid) if self.rx_char else None,
                "tx_uuid": str(self.tx_char.uuid) if self.tx_char else None
            })

        except Exception as e:
            self.client = None
            self.connected_address = None
            self.send_event("error", {"message": f"Connect failed: {str(e)}"})

    async def disconnect(self):
        if self.client:
            try:
                if self.client.is_connected:
                    if self.tx_char:
                        try:
                            await self.client.stop_notify(self.tx_char)
                        except Exception:
                            pass
                    await self.client.disconnect()
            except Exception as e:
                logging.warning(f"Error during disconnect: {e}")
            finally:
                addr = self.connected_address
                self.client = None
                self.connected_address = None
                self.rx_char = None
                self.tx_char = None
                self.send_event("disconnected", {"address": addr})
        else:
            self.send_event("disconnected", {"address": None})

    async def write(self, b64_data):
        if not self.client or not self.client.is_connected or not self.rx_char:
            self.send_event("error", {
                            "message": "Cannot write: BLE not connected or RX characteristic missing"})
            return

        try:
            raw_bytes = base64.b64decode(b64_data)
            # Write without response if supported for high-throughput streaming
            response_required = "write" in self.rx_char.properties and "write-without-response" not in self.rx_char.properties
            await self.client.write_gatt_char(self.rx_char, raw_bytes, response_with_response=response_required)
        except Exception as e:
            self.send_event("error", {"message": f"Write failed: {str(e)}"})


async def main():
    bridge = BleBridge()

    # Inform Electron that bridge is ready
    bridge.send_event("ready", {"pid": os.getpid()})

    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        line_bytes = await reader.readline()
        if not line_bytes:
            break

        line = line_bytes.decode('utf-8').strip()
        if not line:
            continue

        try:
            cmd_data = json.loads(line)
            command = cmd_data.get("command")

            if command == "scan":
                timeout = cmd_data.get("timeout", 5)
                asyncio.create_task(bridge.scan(timeout=timeout))
            elif command == "connect":
                address = cmd_data.get("address")
                asyncio.create_task(bridge.connect(address))
            elif command == "disconnect":
                asyncio.create_task(bridge.disconnect())
            elif command == "write":
                b64_data = cmd_data.get("data", "")
                asyncio.create_task(bridge.write(b64_data))
            elif command == "ping":
                bridge.send_event("pong")
            elif command == "exit":
                await bridge.disconnect()
                break
        except json.JSONDecodeError:
            bridge.send_event(
                "error", {"message": "Invalid JSON command format"})
        except Exception as e:
            bridge.send_event(
                "error", {"message": f"Unexpected error: {str(e)}"})

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
