import { config } from './config.js';

async function main() {
  console.log('BullBearDetector backend starting...', { port: config.port });
  // Modules will be wired up in subsequent tasks
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
