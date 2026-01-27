// packages/scanners/src/git/nextjs-scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { NextJSScanner } from './nextjs-scanner.js';

// Test fixtures for Next.js components
const SERVER_COMPONENT = `
export default function HomePage() {
  return (
    <main>
      <h1>Welcome</h1>
    </main>
  );
}
`;

const CLIENT_COMPONENT = `'use client';

import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}
`;

const NAMED_SERVER_COMPONENT = `
export function AboutPage() {
  return <div>About us</div>;
}
`;

const NAMED_CLIENT_COMPONENT = `'use client';

export function InteractiveForm() {
  return <form>Form content</form>;
}
`;

const ARROW_COMPONENT = `'use client';

const Modal = () => {
  return <div className="modal">Modal content</div>;
};

export default Modal;
`;

const LAYOUT_COMPONENT = `
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
`;

const LOADING_COMPONENT = `
export default function Loading() {
  return <div>Loading...</div>;
}
`;

const ERROR_COMPONENT = `'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
`;

const COMPONENT_WITH_HARDCODED_STYLES = `'use client';

export function StyledCard() {
  return (
    <div style={{ backgroundColor: '#ff0000', padding: '16px' }}>
      Card content
    </div>
  );
}
`;

const COMPONENT_WITH_NEXT_IMAGE = `
import Image from 'next/image';

export function Hero() {
  return (
    <div>
      <Image src="/hero.jpg" alt="Hero image" width={800} height={400} />
    </div>
  );
}
`;

const COMPONENT_WITH_FILL_IMAGE = `
import Image from 'next/image';

export function Background() {
  return (
    <div className="relative h-screen">
      <Image src="/bg.jpg" alt="Background" fill />
    </div>
  );
}
`;

const COMPONENT_WITH_MISSING_ALT = `
import Image from 'next/image';

export function BadImage() {
  return (
    <div>
      <Image src="/bad.jpg" width={100} height={100} />
    </div>
  );
}
`;

const CSS_MODULE_SIMPLE = `
.container {
  display: flex;
  background-color: #f0f0f0;
  padding: 24px;
}

.title {
  color: var(--text-primary);
  font-size: 18px;
}
`;

const CSS_MODULE_WITH_TOKENS = `
.button {
  background-color: var(--primary-color);
  padding: var(--spacing-md);
  border-radius: var(--radius-sm);
}

.icon {
  color: currentColor;
}
`;

describe('NextJSScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('server vs client component detection', () => {
    it('detects server components (default in app directory)', async () => {
      vol.fromJSON({
        '/project/app/page.tsx': SERVER_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.serverComponents.length).toBeGreaterThan(0);
      expect(result.clientComponents.length).toBe(0);

      // Verify server component tag
      const serverComp = result.serverComponents[0]!;
      expect(serverComp.metadata.tags).toContain('server-component');
    });

    it('detects client components via use client directive', async () => {
      vol.fromJSON({
        '/project/app/counter.tsx': CLIENT_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.clientComponents.length).toBeGreaterThan(0);
      expect(result.serverComponents.length).toBe(0);

      // Verify client component tag
      const clientComp = result.clientComponents[0]!;
      expect(clientComp.metadata.tags).toContain('client-component');
    });

    it('handles use client with single quotes', async () => {
      const singleQuoteClient = `'use client';
export function Button() {
  return <button>Click me</button>;
}
`;
      vol.fromJSON({
        '/project/app/button.tsx': singleQuoteClient,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.clientComponents.length).toBe(1);
    });

    it('handles use client with double quotes', async () => {
      const doubleQuoteClient = `"use client";
export function Button() {
  return <button>Click me</button>;
}
`;
      vol.fromJSON({
        '/project/app/button.tsx': doubleQuoteClient,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.clientComponents.length).toBe(1);
    });

    it('treats components outside app/ as neither server nor client', async () => {
      vol.fromJSON({
        '/project/components/Button.tsx': `
export function Button() {
  return <button>Button</button>;
}
`,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['components/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(1);
      expect(result.serverComponents.length).toBe(0);
      expect(result.clientComponents.length).toBe(0);
    });

    it('detects named exports as components', async () => {
      vol.fromJSON({
        '/project/app/about/page.tsx': NAMED_SERVER_COMPONENT,
        '/project/app/form.tsx': NAMED_CLIENT_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.serverComponents.length).toBe(1);
      expect(result.clientComponents.length).toBe(1);
    });

    it('detects arrow function components', async () => {
      vol.fromJSON({
        '/project/app/modal.tsx': ARROW_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.clientComponents.length).toBe(1);
      expect(result.clientComponents[0]!.name).toBe('Modal');
    });
  });

  describe('App Router structure detection', () => {
    it('detects App Router routes', async () => {
      vol.fromJSON({
        '/project/app/page.tsx': SERVER_COMPONENT,
        '/project/app/about/page.tsx': NAMED_SERVER_COMPONENT,
        '/project/app/layout.tsx': LAYOUT_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.routes.length).toBeGreaterThan(0);

      // Should have root route and about route
      const routePaths = result.routes.map(r => r.path);
      expect(routePaths).toContain('/');
      expect(routePaths).toContain('/about');
    });

    it('detects special App Router files', async () => {
      vol.fromJSON({
        '/project/app/page.tsx': SERVER_COMPONENT,
        '/project/app/layout.tsx': LAYOUT_COMPONENT,
        '/project/app/loading.tsx': LOADING_COMPONENT,
        '/project/app/error.tsx': ERROR_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      // Check that route has special files
      const rootRoute = result.routes.find(r => r.path === '/');
      expect(rootRoute).toBeDefined();
      expect(rootRoute!.pageFile).toBeDefined();
      expect(rootRoute!.layoutFile).toBeDefined();
      expect(rootRoute!.loadingFile).toBeDefined();
      expect(rootRoute!.errorFile).toBeDefined();
    });

    it('detects layout component tags', async () => {
      vol.fromJSON({
        '/project/app/layout.tsx': LAYOUT_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      const layout = result.items.find(c => c.metadata.tags?.includes('app-router-layout'));
      expect(layout).toBeDefined();
    });

    it('respects appRouter: false config', async () => {
      vol.fromJSON({
        '/project/app/page.tsx': SERVER_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
        appRouter: false,
      });

      const result = await scanner.scan();

      expect(result.routes.length).toBe(0);
    });
  });

  describe('route group detection', () => {
    it('detects route groups from parentheses directories', async () => {
      vol.fromJSON({
        '/project/app/(dashboard)/settings/page.tsx': SERVER_COMPONENT,
        '/project/app/(marketing)/page.tsx': SERVER_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.routeGroups).toContain('dashboard');
      expect(result.routeGroups).toContain('marketing');
    });

    it('excludes route group from path but tracks it in metadata', async () => {
      vol.fromJSON({
        '/project/app/(admin)/users/page.tsx': SERVER_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      // Route path should NOT include (admin)
      const usersRoute = result.routes.find(r => r.path === '/users');
      expect(usersRoute).toBeDefined();
      expect(usersRoute!.routeGroup).toBe('admin');
    });

    it('tags components with route group', async () => {
      vol.fromJSON({
        '/project/app/(auth)/login/page.tsx': CLIENT_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      const loginComponent = result.clientComponents[0]!;
      expect(loginComponent.metadata.tags).toContain('route-group-auth');
    });
  });

  describe('dynamic route detection', () => {
    it('detects dynamic route segments', async () => {
      vol.fromJSON({
        '/project/app/users/[id]/page.tsx': SERVER_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      const userRoute = result.routes.find(r => r.path.includes('[id]'));
      expect(userRoute).toBeDefined();
      expect(userRoute!.isDynamic).toBe(true);
    });

    it('detects catch-all routes', async () => {
      vol.fromJSON({
        '/project/app/docs/[...slug]/page.tsx': SERVER_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      const docsRoute = result.routes.find(r => r.path.includes('[slug]'));
      expect(docsRoute).toBeDefined();
      expect(docsRoute!.isDynamic).toBe(true);
    });
  });

  // Note: CSS Module scanning and next/image validation use glob which
  // operates on real filesystem, not memfs. These are tested via integration
  // tests against real Next.js projects in buoy-lab.

  describe('CSS Module config', () => {
    it('respects cssModules: false config', async () => {
      vol.fromJSON({
        '/project/app/page.tsx': SERVER_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
        cssModules: false,
      });

      const result = await scanner.scan();

      // With cssModules: false, no CSS modules should be scanned
      expect(result.cssModules.length).toBe(0);
    });
  });

  describe('next/image config', () => {
    it('respects validateImage: false config', async () => {
      vol.fromJSON({
        '/project/app/hero.tsx': COMPONENT_WITH_NEXT_IMAGE,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
        validateImage: false,
      });

      const result = await scanner.scan();

      // With validateImage: false, no image usage should be scanned
      expect(result.imageUsage.length).toBe(0);
    });
  });

  describe('hardcoded value detection', () => {
    it('detects hardcoded colors in style props', async () => {
      vol.fromJSON({
        '/project/app/card.tsx': COMPONENT_WITH_HARDCODED_STYLES,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      const component = result.items[0]!;
      const hardcoded = component.metadata.hardcodedValues || [];

      expect(hardcoded).toContainEqual(
        expect.objectContaining({ type: 'color', value: '#ff0000' })
      );
    });

    it('detects hardcoded spacing in style props', async () => {
      vol.fromJSON({
        '/project/app/card.tsx': COMPONENT_WITH_HARDCODED_STYLES,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      const component = result.items[0]!;
      const hardcoded = component.metadata.hardcodedValues || [];

      expect(hardcoded).toContainEqual(
        expect.objectContaining({ type: 'spacing', value: '16px' })
      );
    });
  });

  describe('error handling', () => {
    it('gracefully handles missing app directory', async () => {
      vol.fromJSON({
        '/project/src/Button.tsx': `
export function Button() {
  return <button>Button</button>;
}
`,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      // Should not throw and routes should be empty
      expect(result.routes.length).toBe(0);
      expect(result.items.length).toBe(1);
    });

    it('continues scanning when some files have issues', async () => {
      vol.fromJSON({
        '/project/app/valid1.tsx': SERVER_COMPONENT,
        '/project/app/valid2.tsx': CLIENT_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      // Should process all valid files
      expect(result.items.length).toBe(2);
    });
  });

  describe('scan statistics', () => {
    it('reports accurate file and component counts', async () => {
      vol.fromJSON({
        '/project/app/page.tsx': SERVER_COMPONENT,
        '/project/app/counter.tsx': CLIENT_COMPONENT,
        '/project/app/about/page.tsx': NAMED_SERVER_COMPONENT,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.stats.filesScanned).toBe(3);
      expect(result.stats.itemsFound).toBe(result.items.length);
    });
  });

  describe('integration with src directory', () => {
    it('scans both app/ and src/ directories when configured', async () => {
      vol.fromJSON({
        '/project/app/page.tsx': SERVER_COMPONENT,
        '/project/src/components/Button.tsx': `
export function Button() {
  return <button>Button</button>;
}
`,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx', 'src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(2);
    });
  });

  describe('exclude patterns', () => {
    it('excludes test files by default', async () => {
      vol.fromJSON({
        '/project/app/page.tsx': SERVER_COMPONENT,
        '/project/app/page.test.tsx': `
import { render } from '@testing-library/react';
import Page from './page';

test('renders', () => {
  render(<Page />);
});
`,
      });

      const scanner = new NextJSScanner({
        projectRoot: '/project',
        include: ['app/**/*.tsx'],
        exclude: ['**/*.test.tsx', '**/*.spec.tsx'],
      });

      const result = await scanner.scan();

      // Should only have the page component, not the test file
      expect(result.items.length).toBe(1);
    });
  });
});
