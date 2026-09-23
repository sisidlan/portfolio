import { preview } from 'astro';

// ============================================================================
// Playwright-managed production preview
// ============================================================================
// The programmatic preview stays attached to Playwright for reliable server cleanup.
const server = await preview({ server: { host: '127.0.0.1', port: 4323 } });

async function stop() {
    await server.stop();
    process.exit(0);
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
