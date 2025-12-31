// Base
export { Scanner, type ScannerConfig, type ScanResult, type ScanError, type ScanStats } from './base/index.js';

// Style extractors
export * from './extractors/index.js';

// Git/local scanners
export { ReactComponentScanner, type ReactScannerConfig } from './git/index.js';
export { TokenScanner, type TokenScannerConfig } from './git/index.js';

// Figma scanner
export { FigmaClient, FigmaComponentScanner, type FigmaScannerConfig } from './figma/index.js';

// Storybook scanner
export { StorybookScanner, type StorybookScannerConfig } from './storybook/index.js';

// Tailwind scanner
export { TailwindScanner, TailwindConfigParser, ArbitraryValueDetector } from './tailwind/index.js';
export type { TailwindScannerConfig, TailwindScanResult, TailwindTheme, ArbitraryValue } from './tailwind/index.js';

// Plugin adapter
export { createPluginFromScanner } from './plugin-adapter.js';
