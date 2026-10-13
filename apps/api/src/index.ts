import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { paymentsMode } from './payments.js';
import { initRealtime } from './realtime.js';

const server = createServer(createApp());
initRealtime(server);
server.listen(config.port, () => {
  console.log(`Car wash API on http://localhost:${config.port} (payments: ${paymentsMode})`);
});
