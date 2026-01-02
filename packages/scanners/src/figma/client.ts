export interface FigmaFile {
  name: string;
  document: FigmaDocument;
  components: Record<string, FigmaComponentMeta>;
  styles: Record<string, FigmaStyleMeta>;
}

export interface FigmaDocument {
  id: string;
  name: string;
  type: string;
  children: FigmaNode[];
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  componentId?: string;
  componentPropertyDefinitions?: Record<string, FigmaPropertyDefinition>;
  boundVariables?: Record<string, unknown>;
}

export interface FigmaPropertyDefinition {
  type: string;
  defaultValue: unknown;
  variantOptions?: string[];
  description?: string;
  preferredValues?: Array<{ type: string; key: string }>;
}

export interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
  documentationLinks: string[];
  remote?: boolean;
}

export interface FigmaStyleMeta {
  key: string;
  name: string;
  styleType: string;
  description: string;
}

export interface FigmaVariablesResponse {
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

export interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  resolvedType: string;
  valuesByMode: Record<string, FigmaVariableValue>;
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: { modeId: string; name: string }[];
  defaultModeId: string;
}

export type FigmaVariableValue =
  | { type: "COLOR"; value: { r: number; g: number; b: number; a: number } }
  | { type: "FLOAT"; value: number }
  | { type: "STRING"; value: string }
  | { type: "BOOLEAN"; value: boolean };

export interface FigmaNodesResponse {
  name: string;
  nodes: Record<string, { document: FigmaNode }>;
}

export interface FigmaImageResponse {
  images: Record<string, string | null>;
}

export interface FigmaImageOptions {
  format?: "jpg" | "png" | "svg" | "pdf";
  scale?: number;
}

export interface RateLimitInfo {
  remaining: number;
  resetAt: number;
}

/**
 * Custom error class for Figma API errors with status code information
 */
export class FigmaAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = "FigmaAPIError";
  }
}

/**
 * Error thrown when authentication fails (401, 403)
 */
export class FigmaAuthError extends FigmaAPIError {
  constructor(message: string, statusCode: number, responseBody: string) {
    super(message, statusCode, responseBody);
    this.name = "FigmaAuthError";
  }
}

/**
 * Error thrown when a resource is not found (404)
 */
export class FigmaNotFoundError extends FigmaAPIError {
  constructor(message: string, responseBody: string) {
    super(message, 404, responseBody);
    this.name = "FigmaNotFoundError";
  }
}

/**
 * Error thrown when rate limit is exceeded (429)
 */
export class FigmaRateLimitError extends FigmaAPIError {
  constructor(
    message: string,
    responseBody: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message, 429, responseBody);
    this.name = "FigmaRateLimitError";
  }
}

export interface FigmaClientOptions {
  /**
   * Maximum number of retry attempts for failed requests
   * @default 3
   */
  maxRetries?: number;

  /**
   * Initial delay in milliseconds before first retry (exponential backoff)
   * @default 1000
   */
  initialRetryDelayMs?: number;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeoutMs?: number;

  /**
   * Enable request caching
   * @default true
   */
  enableCache?: boolean;

  /**
   * Cache time-to-live in milliseconds
   * @default 60000 (1 minute)
   */
  cacheTtlMs?: number;

  /**
   * Threshold for proactive rate limiting.
   * When remaining requests fall below this threshold, the client will
   * wait until the rate limit resets before making new requests.
   * @default 0 (disabled)
   */
  proactiveRateLimitThreshold?: number;

  /**
   * Authentication type to use
   * @default 'personal'
   */
  authType?: "personal" | "oauth2";
}

/**
 * Options for creating a Figma client with authentication
 */
export interface CreateFigmaClientOptions extends FigmaClientOptions {
  accessToken: string;
}

/**
 * Options for fetching a file
 */
export interface GetFileOptions {
  /**
   * Specific version ID to fetch
   */
  version?: string;
}

/**
 * Response from team projects endpoint
 */
export interface FigmaTeamProjectsResponse {
  projects: Array<{ id: string; name: string }>;
}

/**
 * Response from project files endpoint
 */
export interface FigmaProjectFilesResponse {
  files: Array<{ key: string; name: string; thumbnail_url?: string }>;
}

/**
 * Response from file versions endpoint
 */
export interface FigmaFileVersionsResponse {
  versions: Array<{ id: string; created_at: string; label?: string }>;
}

/**
 * Response from comments endpoint
 */
export interface FigmaCommentsResponse {
  comments: Array<{
    id: string;
    message: string;
    user: { handle: string; img_url?: string };
  }>;
}

/**
 * Response from component sets endpoint
 */
export interface FigmaComponentSetsResponse {
  meta: {
    component_sets: Array<{ key: string; name: string; description: string }>;
  };
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * HTTP status codes that should trigger a retry
 */
const RETRYABLE_STATUS_CODES = [
  429, // Too Many Requests (rate limit)
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
];

/**
 * HTTP status codes that should NOT be retried (client errors except rate limit)
 */
const NON_RETRYABLE_STATUS_CODES = [
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
];

export class FigmaClient {
  private accessToken: string;
  private baseUrl = "https://api.figma.com/v1";
  private timeoutMs: number;
  private maxRetries: number;
  private initialRetryDelayMs: number;
  private enableCache: boolean;
  private cacheTtlMs: number;
  private proactiveRateLimitThreshold: number;
  private authType: "personal" | "oauth2";
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(accessToken: string, options: FigmaClientOptions = {}) {
    if (!accessToken || accessToken.trim() === "") {
      throw new Error("Access token is required");
    }
    this.accessToken = accessToken;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.maxRetries = options.maxRetries ?? 3;
    this.initialRetryDelayMs = options.initialRetryDelayMs ?? 1000;
    this.enableCache = options.enableCache ?? true;
    this.cacheTtlMs = options.cacheTtlMs ?? 60000;
    this.proactiveRateLimitThreshold = options.proactiveRateLimitThreshold ?? 0;
    this.authType = options.authType ?? "personal";
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    // Check cache first
    if (this.enableCache) {
      const cached = this.getFromCache<T>(endpoint);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Proactive rate limit waiting
    await this.waitForRateLimitIfNeeded();

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const result = await this.fetchOnce<T>(endpoint);

        // Cache the result
        if (this.enableCache) {
          this.setCache(endpoint, result);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        const shouldRetry = this.shouldRetry(lastError, attempt);
        if (!shouldRetry) {
          throw lastError;
        }

        // Calculate delay with exponential backoff + jitter
        const delay = this.calculateRetryDelay(attempt, lastError);
        await this.sleep(delay);

        attempt++;
      }
    }

    // Convert to specific error type if rate limit was exhausted
    if (
      lastError instanceof FigmaAPIError &&
      lastError.statusCode === 429 &&
      !(lastError instanceof FigmaRateLimitError)
    ) {
      const retryAfter = (lastError as FigmaAPIError & { retryAfter?: number })
        .retryAfter;
      throw new FigmaRateLimitError(
        lastError.message,
        lastError.responseBody,
        retryAfter
      );
    }

    // All retries exhausted
    throw lastError ?? new Error("Unknown error during Figma API request");
  }

  /**
   * Wait proactively if we're approaching the rate limit
   */
  private async waitForRateLimitIfNeeded(): Promise<void> {
    if (
      this.proactiveRateLimitThreshold <= 0 ||
      !this.rateLimitInfo ||
      this.rateLimitInfo.remaining > this.proactiveRateLimitThreshold
    ) {
      return;
    }

    const waitTime = Math.max(0, this.rateLimitInfo.resetAt - Date.now());
    if (waitTime > 0) {
      await this.sleep(waitTime);
    }
  }

  private async fetchOnce<T>(endpoint: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> =
        this.authType === "oauth2"
          ? { Authorization: `Bearer ${this.accessToken}` }
          : { "X-Figma-Token": this.accessToken };

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers,
        signal: controller.signal,
      });

      // Track rate limit headers
      this.updateRateLimitInfo(response);

      if (!response.ok) {
        const text = await response.text();
        const baseMessage = `Figma API error: ${response.status} ${response.statusText} - ${text}`;

        // Throw specific error types based on status code
        switch (response.status) {
          case 401:
          case 403:
            throw new FigmaAuthError(baseMessage, response.status, text);
          case 404:
            throw new FigmaNotFoundError(baseMessage, text);
          case 429: {
            const retryAfter = this.parseRetryAfter(response);
            const error = new FigmaRateLimitError(baseMessage, text, retryAfter);
            // Also attach retryAfter for retry logic compatibility
            (error as FigmaRateLimitError & { retryAfter?: number }).retryAfter =
              retryAfter;
            throw error;
          }
          default: {
            const error = new FigmaAPIError(baseMessage, response.status, text);
            throw error;
          }
        }
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `Figma API request timed out after ${this.timeoutMs / 1000}s`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse Retry-After header from response
   * Returns delay in milliseconds or undefined if not present/parseable
   */
  private parseRetryAfter(response: Response): number | undefined {
    const retryAfter = response.headers.get("Retry-After");
    if (!retryAfter) return undefined;

    // Try parsing as seconds
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    // Try parsing as HTTP-date
    const date = Date.parse(retryAfter);
    if (!isNaN(date)) {
      return Math.max(0, date - Date.now());
    }

    return undefined;
  }

  /**
   * Update rate limit tracking info from response headers
   */
  private updateRateLimitInfo(response: Response): void {
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const reset = response.headers.get("X-RateLimit-Reset");

    if (remaining !== null) {
      this.rateLimitInfo = {
        remaining: parseInt(remaining, 10),
        resetAt: reset ? parseInt(reset, 10) * 1000 : Date.now() + 60000,
      };
    }
  }

  /**
   * Get current rate limit information
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetry(error: Error, attempt: number): boolean {
    // Don't retry if we've exhausted attempts
    if (attempt >= this.maxRetries) {
      return false;
    }

    // Retry on timeout
    if (error.message.includes("timed out")) {
      return true;
    }

    // Don't retry on non-retryable status codes
    if (
      error instanceof FigmaAPIError &&
      NON_RETRYABLE_STATUS_CODES.includes(error.statusCode)
    ) {
      return false;
    }

    // Retry on specific status codes
    if (
      error instanceof FigmaAPIError &&
      RETRYABLE_STATUS_CODES.includes(error.statusCode)
    ) {
      return true;
    }

    // Retry on network errors
    if (
      error.message.includes("fetch failed") ||
      error.message.includes("network")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number, error: Error): number {
    // Check for Retry-After header hint from rate limiting
    if (error instanceof FigmaAPIError && error.statusCode === 429) {
      const retryAfter = (error as FigmaAPIError & { retryAfter?: number })
        .retryAfter;
      if (retryAfter !== undefined) {
        return retryAfter + this.jitter();
      }

      // For rate limits without Retry-After, use a longer base delay
      const baseDelay = this.initialRetryDelayMs * 2;
      return baseDelay * Math.pow(2, attempt) + this.jitter();
    }

    // Exponential backoff: delay = initialDelay * 2^attempt + jitter
    const exponentialDelay = this.initialRetryDelayMs * Math.pow(2, attempt);

    // Cap at 30 seconds max delay
    const cappedDelay = Math.min(exponentialDelay, 30000);

    return cappedDelay + this.jitter();
  }

  /**
   * Add random jitter (0-500ms) to prevent thundering herd
   */
  private jitter(): number {
    return Math.floor(Math.random() * 500);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get value from cache if it exists and hasn't expired
   */
  private getFromCache<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  /**
   * Set value in cache with TTL
   */
  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Fetch a Figma file
   * @param fileKey The key of the file to fetch
   * @param options Optional parameters including version
   */
  async getFile(fileKey: string, options?: GetFileOptions): Promise<FigmaFile> {
    let endpoint = `/files/${fileKey}`;
    if (options?.version) {
      endpoint += `?version=${encodeURIComponent(options.version)}`;
    }
    return this.fetch<FigmaFile>(endpoint);
  }

  /**
   * Fetch specific nodes from a file by their IDs
   * More efficient than fetching the entire file when you only need specific nodes
   */
  async getNodes(
    fileKey: string,
    nodeIds: string[],
  ): Promise<FigmaNodesResponse> {
    const ids = nodeIds.map(encodeURIComponent).join(",");
    return this.fetch<FigmaNodesResponse>(`/files/${fileKey}/nodes?ids=${ids}`);
  }

  async getFileComponents(
    fileKey: string,
  ): Promise<{ meta: { components: FigmaComponentMeta[] } }> {
    return this.fetch(`/files/${fileKey}/components`);
  }

  async getFileStyles(
    fileKey: string,
  ): Promise<{ meta: { styles: FigmaStyleMeta[] } }> {
    return this.fetch(`/files/${fileKey}/styles`);
  }

  /**
   * Fetch component sets from a file
   */
  async getFileComponentSets(
    fileKey: string,
  ): Promise<FigmaComponentSetsResponse> {
    return this.fetch(`/files/${fileKey}/component_sets`);
  }

  async getLocalVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    return this.fetch(`/files/${fileKey}/variables/local`);
  }

  /**
   * Fetch version history for a file
   */
  async getFileVersions(fileKey: string): Promise<FigmaFileVersionsResponse> {
    return this.fetch(`/files/${fileKey}/versions`);
  }

  /**
   * Fetch comments on a file
   */
  async getComments(fileKey: string): Promise<FigmaCommentsResponse> {
    return this.fetch(`/files/${fileKey}/comments`);
  }

  /**
   * Fetch projects for a team
   */
  async getTeamProjects(teamId: string): Promise<FigmaTeamProjectsResponse> {
    return this.fetch(`/teams/${teamId}/projects`);
  }

  /**
   * Fetch files in a project
   */
  async getProjectFiles(projectId: string): Promise<FigmaProjectFilesResponse> {
    return this.fetch(`/projects/${projectId}/files`);
  }

  /**
   * Get image URLs for specific nodes in a file
   * Returns URLs to rendered images that can be downloaded
   */
  async getImageUrls(
    fileKey: string,
    nodeIds: string[],
    options?: FigmaImageOptions,
  ): Promise<FigmaImageResponse> {
    const ids = nodeIds.map(encodeURIComponent).join(",");
    let url = `/images/${fileKey}?ids=${ids}`;

    if (options?.format) {
      url += `&format=${options.format}`;
    }
    if (options?.scale !== undefined) {
      url += `&scale=${options.scale}`;
    }

    return this.fetch<FigmaImageResponse>(url);
  }

  getFigmaUrl(fileKey: string, nodeId?: string): string {
    const base = `https://www.figma.com/file/${fileKey}`;
    if (nodeId) {
      return `${base}?node-id=${encodeURIComponent(nodeId)}`;
    }
    return base;
  }
}

/**
 * Factory function to create a FigmaClient with authentication options
 */
export function createFigmaClient(
  options: CreateFigmaClientOptions
): FigmaClient {
  return new FigmaClient(options.accessToken, options);
}
