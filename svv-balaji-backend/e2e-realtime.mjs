// Tiny socket.io client used by e2e-checkout-flow.py.
//   node e2e-realtime.mjs <origin> <token> listen   -> prints "READY", then one JSON line per event
//   node e2e-realtime.mjs <origin> <token> auth     -> prints "OK" (joined) or "UNAUTHORIZED", then exits
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { io } = require('../svv-balaji-admin/node_modules/socket.io-client');

const [, , origin, token, mode] = process.argv;
const socket = io(`${origin}/admin`, { auth: { token }, transports: ['websocket'], reconnection: false });

socket.on('ready', () => {
  if (mode === 'auth') {
    console.log('OK');
    process.exit(0);
  }
  console.log('READY');
});
socket.on('unauthorized', () => {
  if (mode === 'auth') {
    console.log('UNAUTHORIZED');
    process.exit(0);
  }
});
socket.on('orders:new', (o) => console.log(JSON.stringify({ event: 'orders:new', ...o })));
socket.on('orders:updated', (o) => console.log(JSON.stringify({ event: 'orders:updated', ...o })));
socket.on('connect_error', (e) => {
  console.log(`CONNECT_ERROR ${e.message}`);
  process.exit(1);
});
setTimeout(() => process.exit(0), 120000).unref();
