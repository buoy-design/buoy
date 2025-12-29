import { vi } from 'vitest';

// Mock fs/promises for scanner tests
vi.mock('fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Reset filesystem between tests
beforeEach(() => {
  // Clear virtual filesystem
});
