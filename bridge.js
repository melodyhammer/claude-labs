/**
 * bridge.js — runs locally on your machine
 * Reads Arduino serial data and pushes it to Firebase Realtime Database.
 *
 * Usage:
 *   node bridge.js
 *   SERIAL_PORT=/dev/cu.usbmodem101 node bridge.js
 *   BAUD_RATE=115200 node bridge.js
 */

require('dotenv').config();
const admin = require('firebase-admin');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const BAUD_RATE    = parseInt(process.env.BAUD_RATE  || '9600');
const SERIAL_PATH  = process.env.SERIAL_PORT         || null;
const UPDATE_MS    = parseInt(process.env.UPDATE_MS  || '100'); // throttle to ~10 Hz

// ── Firebase Admin init ───────────────────────────────────────────────────
if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.FIREBASE_DATABASE_URL) {
  console.error('\n  Error: missing FIREBASE_SERVICE_ACCOUNT or FIREBASE_DATABASE_URL');
  console.error('  Copy .env.example → .env and fill in your Firebase credentials.\n');
  process.exit(1);
}

admin.initializeApp({
  credential:  admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const sensorRef = admin.database().ref('sensor/value');

// ── Throttled publish ────────────────────────────────────────────────────
let lastPublish = 0;

function publish(value) {
  const now = Date.now();
  if (now - lastPublish < UPDATE_MS) return;
  lastPublish = now;
  sensorRef.set(value).catch(err => console.error('Firebase write error:', err.message));
}

// ── Serial port ──────────────────────────────────────────────────────────
async function startSerial() {
  let portPath = SERIAL_PATH;

  if (!portPath) {
    const ports = await SerialPort.list();
    const found = ports.find(p =>
      p.manufacturer?.toLowerCase().includes('arduino') ||
      p.manufacturer?.toLowerCase().includes('wch')     ||
      p.vendorId === '2341' ||   // Arduino
      p.vendorId === '1a86' ||   // CH340
      p.vendorId === '0403'      // FTDI
    );
    if (found) {
      portPath = found.path;
      console.log(`  Auto-detected Arduino on ${portPath}`);
    } else {
      console.log('  Available serial ports:');
      if (ports.length) ports.forEach(p => console.log(`    ${p.path}  ${p.manufacturer || ''}`));
      else              console.log('    (none found)');
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

    port.on('open',  () => console.log(`  Serial: ${portPath} @ ${BAUD_RATE} baud\n`));
    port.on('error', err => { console.error('  Serial error:', err.message); runDemo(); });

    parser.on('data', line => {
      const v = parseFloat(line.trim());
      if (!isNaN(v)) publish(v);
    });
  } catch (e) {
    console.error('  Could not open port:', e.message);
    runDemo();
  }
}

// ── Demo mode ────────────────────────────────────────────────────────────
function runDemo() {
  console.log('  Demo mode: pushing simulated values to Firebase\n');
  let t = 0;
  setInterval(() => {
    t += 0.022;
    const v = 511 + 488 * Math.sin(t) * (0.65 + 0.35 * Math.sin(t * 2.1));
    publish(Math.max(0, Math.min(1023, Math.round(v))));
  }, 50);
}

console.log('\n  Arduino → Firebase Bridge');
console.log('  Press Ctrl+C to stop.\n');
startSerial();
