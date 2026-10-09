// devhub-bridge: runs on a herdr server and exposes it to devhub apps.

import { detectOwner } from './auth.ts';
import { BrowserStore } from './browser/store.ts';
import { config } from './config.ts';
import { herdrSocketPath } from './herdr/client.ts';
import { startCollector } from './hub/collector.ts';
import { startServer } from './server.ts';
import { PromptWatcher, Sessions } from './session.ts';

const owner = await detectOwner();
const collector = startCollector();
const prompts = new PromptWatcher(collector);
const sessions = new Sessions(collector, prompts);
const browser = new BrowserStore();
const server = startServer(collector, sessions, prompts, browser);

console.log(
  [
    `devhub-bridge listening on http://${config.host}:${server.port}${config.basePath || ''}`,
    `  herdr socket: ${herdrSocketPath()}`,
    `  tailscale owner: ${owner ?? '(none detected)'}`,
    `  token auth: ${config.token ? 'enabled' : 'disabled'}`,
  ].join('\n'),
);

const shutdown = () => {
  collector.stop();
  prompts.stop();
  server.stop(true);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
