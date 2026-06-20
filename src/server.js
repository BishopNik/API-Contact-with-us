import http from 'node:http';
import { createHandler } from './app.js';
import { loadConfig, loadEnvFile } from './config.js';

loadEnvFile();
const config = loadConfig();
const server = http.createServer(createHandler(config));

server.listen(config.port, () => {
  console.log(`Contact API listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(error => process.exit(error ? 1 : 0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
