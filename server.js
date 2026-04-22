/**
 * Arduino Live Gauge – server.js
 *
 * Usage:
 *   node server.js                          # auto-detect Arduino port
 *   SERIAL_PORT=/dev/cu.usbmodem101 node server.js
 *   SERIAL_PORT=COM3 BAUD_RATE=115200 node server.js
 *
 * Arduino should Serial.println() a number each loop, e.g.:
 *   Serial.println(analogRead(A0));   // sends 0–1023
 */

const express  = require('express');
const { WebSocketServer } = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = require('path');

const BAUD_RATE   = parseInt(process.env.BAUD_RATE  || '9600');
const HTTP_PORT   = parseInt(process.env.PORT        || '3000');
const SERIAL_PATH = process.env.SERIAL_PORT          || null;

// ── HTTP server ────────────────────────────────────────────────────────────
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(HTTP_PORT, () => {
  console.log(`\n  Arduino Gauge  →  http://localhost:${HTTP_PORT}\n`);
});

// ── WebSocket broadcast ────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

function broadcast(value) {
  const msg = JSON.stringify({ value });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

// ── Serial port ────────────────────────────────────────────────────────────
async function startSerial() {
  let portPath = SERIAL_PATH;

  if (!portPath) {
    const ports = await SerialPort.list();
    const found = ports.find(p =>
      p.manufacturer?.toLowerCase().includes('arduino') ||
      p.manufacturer?.toLowerCase().includes('wch')     ||
      p.vendorId === '2341' ||   // Arduino
      p.vendorId === '1a86' ||   // CH340 (clone boards)
      p.vendorId === '0403'      // FTDI
    );

    if (found) {
      portPath = found.path;
      console.log(`  Auto-detected Arduino on ${portPath}`);
    } else {
      console.log('  Available serial ports:');
      if (ports.length) ports.forEach(p => console.log(`    ${p.path}  ${p.manufacturer || ''}`));
      else              console.log('    (none found)');
      console.log('\n  Set SERIAL_PORT env var to choose a port manually.');
    }
  }

  if (!portPath) {
    console.warn('\n  No Arduino found — running in demo mode (simulated data).\n');
    runDemo();
    return;
  }

  try {
    const port   = new SerialPort({ path: portPath, baudRate: BAUD_RATE });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    port.on('open',  () => console.log(`  Serial open: ${portPath} @ ${BAUD_RATE} baud\n`));
    port.on('error', err => { console.error('  Serial error:', err.message); runDemo(); });

    parser.on('data', line => {
      const v = parseFloat(line.trim());
      if (!isNaN(v)) broadcast(v);
    });
  } catch (e) {
    console.error('  Could not open port:', e.message);
    runDemo();
  }
}

// ── Demo mode: sine-wave simulation ───────────────────────────────────────
function runDemo() {
  console.log('  Demo mode: simulating sensor values (0–1023)\n');
  let t = 0;
  setInterval(() => {
    t += 0.022;
    const v = 511 + 488 * Math.sin(t) * (0.65 + 0.35 * Math.sin(t * 2.1));
    broadcast(Math.max(0, Math.min(1023, Math.round(v))));
  }, 50);
}

startSerial();
