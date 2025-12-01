import killPort from 'kill-port';

const VITE_PORT = 5173;

async function ensurePortIsFree(port) {
  try {
    await killPort(port);
    console.log(`Port ${port} was occupied and has been released.`);
  } catch (error) {
    if (
      error?.message?.includes('does not appear to be running') ||
      error?.code === 'ECONNREFUSED'
    ) {
      // There was nothing to kill, which is fine.
      return;
    }
    console.warn(`Failed to release port ${port}: ${error?.message ?? error}`);
  }
}

await ensurePortIsFree(VITE_PORT);

