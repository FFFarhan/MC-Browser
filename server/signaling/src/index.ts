import { signalingOptionsFromEnvironment, startSignalingServer } from './server.js';

const server = await startSignalingServer(signalingOptionsFromEnvironment(process.env));
console.info(`Stonefield signaling listening at ${server.httpUrl}`);

const shutdown = () => {
  void server.close().then(() => process.exit(0));
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
