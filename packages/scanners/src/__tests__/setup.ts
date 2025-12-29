import { vi, beforeEach } from 'vitest';

// Mock fs/promises for scanner tests
vi.mock('fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Mock glob to work with memfs
vi.mock('glob', async () => {
  return {
    glob: async (
      pattern: string,
      options: { cwd?: string; ignore?: string[]; absolute?: boolean }
    ): Promise<string[]> => {
      const { vol } = await import('memfs');
      const allFiles = Object.keys(vol.toJSON());
      const cwd = options?.cwd || '/';

      // Convert glob pattern to regex
      const escapeRegex = (str: string) =>
        str.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

      const patternToRegex = (p: string) => {
        let regex = '';
        let i = 0;
        while (i < p.length) {
          if (p[i] === '*' && p[i + 1] === '*') {
            // ** matches any path segment(s)
            if (p[i + 2] === '/') {
              regex += '(?:[^/]+/)*';
              i += 3;
            } else {
              regex += '.*';
              i += 2;
            }
          } else if (p[i] === '*') {
            // * matches anything except /
            regex += '[^/]*';
            i++;
          } else if (p[i] === '?') {
            regex += '[^/]';
            i++;
          } else {
            regex += escapeRegex(p[i]!);
            i++;
          }
        }
        return new RegExp(`^${regex}$`);
      };

      const matchPattern = patternToRegex(pattern);

      return allFiles.filter((file) => {
        // Check if file is under cwd
        if (!file.startsWith(cwd)) return false;

        // Get relative path for matching
        let relativePath = file.slice(cwd.length);
        if (relativePath.startsWith('/')) {
          relativePath = relativePath.slice(1);
        }

        // Check against ignore patterns
        if (options?.ignore) {
          for (const ignorePattern of options.ignore) {
            const ignoreRegex = patternToRegex(ignorePattern);
            if (ignoreRegex.test(relativePath)) return false;
          }
        }

        // Match against pattern
        if (!matchPattern.test(relativePath)) return false;

        return true;
      }).map((file) => (options?.absolute ? file : file.slice(cwd.length + 1)));
    },
  };
});

// Reset filesystem between tests
beforeEach(async () => {
  const { vol } = await import('memfs');
  vol.reset();
});
