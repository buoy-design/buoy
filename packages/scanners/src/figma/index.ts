export {
  FigmaClient,
  FigmaAPIError,
  FigmaCircuitBreakerError,
  type FigmaClientOptions,
  type FigmaFile,
  type FigmaNode,
  type FigmaVariable,
  type CircuitBreakerOptions,
  type CircuitBreakerState,
} from "./client.js";
export {
  FigmaComponentScanner,
  type FigmaScannerConfig,
  type FigmaScanResult,
  type FigmaVersionChange,
  type FigmaOrphanReport,
} from "./component-scanner.js";
