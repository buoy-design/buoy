/**
 * Buoy Cloud API Client
 *
 * HTTP client for interacting with the Buoy Cloud API
 */

import { getApiToken, getApiEndpoint } from './config.js';

export interface ApiError {
  error: string;
  message?: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

/**
 * Make an authenticated request to the Buoy Cloud API
 */
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const endpoint = getApiEndpoint();
  const token = getApiToken();

  const url = `${endpoint}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        error: (data as ApiError).error || `Request failed with status ${response.status}`,
        status: response.status,
      };
    }

    return {
      ok: true,
      data: data as T,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error',
      status: 0,
    };
  }
}

// ============================================================================
// Auth API
// ============================================================================

export interface AuthMeResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    githubLogin: string | null;
    role: string;
  };
  account: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
}

export async function getMe(): Promise<ApiResponse<AuthMeResponse>> {
  return apiRequest<AuthMeResponse>('/auth/me');
}

// ============================================================================
// API Keys API
// ============================================================================

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes?: string[];
  expiresIn?: number;
}

export interface CreateApiKeyResponse extends ApiKey {
  key: string; // Full key, only shown once
}

export async function listApiKeys(): Promise<ApiResponse<{ keys: ApiKey[] }>> {
  return apiRequest<{ keys: ApiKey[] }>('/api-keys');
}

export async function createApiKey(
  data: CreateApiKeyRequest
): Promise<ApiResponse<CreateApiKeyResponse>> {
  return apiRequest<CreateApiKeyResponse>('/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function revokeApiKey(id: string): Promise<ApiResponse<{ success: boolean }>> {
  return apiRequest<{ success: boolean }>(`/api-keys/${id}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// Projects API
// ============================================================================

export interface Project {
  id: string;
  name: string;
  repoUrl: string | null;
  defaultBranch: string;
  settings: {
    autoScan?: boolean;
    prComments?: boolean;
    checkRuns?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  repoUrl?: string;
  defaultBranch?: string;
  settings?: {
    autoScan?: boolean;
    prComments?: boolean;
    checkRuns?: boolean;
  };
}

export async function listProjects(): Promise<ApiResponse<{ projects: Project[] }>> {
  return apiRequest<{ projects: Project[] }>('/projects');
}

export async function getProject(id: string): Promise<ApiResponse<Project>> {
  return apiRequest<Project>(`/projects/${id}`);
}

export async function createProject(data: CreateProjectRequest): Promise<ApiResponse<Project>> {
  return apiRequest<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(
  id: string,
  data: Partial<CreateProjectRequest>
): Promise<ApiResponse<Project>> {
  return apiRequest<Project>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<ApiResponse<{ success: boolean }>> {
  return apiRequest<{ success: boolean }>(`/projects/${id}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// Scans API
// ============================================================================

export interface ScanComponent {
  name: string;
  path: string;
  framework?: string;
  props?: Array<{
    name: string;
    type?: string;
    required?: boolean;
    defaultValue?: unknown;
  }>;
  imports?: string[];
  loc?: number;
}

export interface ScanToken {
  name: string;
  value: string;
  type: string;
  path?: string;
  source?: string;
}

export interface ScanDriftSignal {
  type: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  component?: string;
  token?: string;
  suggestion?: string;
}

export interface UploadScanRequest {
  commitSha?: string;
  branch?: string;
  author?: string;
  timestamp?: string;
  components: ScanComponent[];
  tokens: ScanToken[];
  drift: ScanDriftSignal[];
  summary?: {
    totalComponents: number;
    totalTokens: number;
    totalDrift: number;
    driftByType?: Record<string, number>;
    driftBySeverity?: Record<string, number>;
  };
}

export interface UploadScanResponse {
  id: string;
  projectId: string;
  summary: {
    totalComponents: number;
    totalTokens: number;
    totalDrift: number;
    driftByType?: Record<string, number>;
    driftBySeverity?: Record<string, number>;
  };
  createdAt: string;
}

export interface Scan {
  id: string;
  commitSha: string | null;
  branch: string | null;
  author: string | null;
  componentsCount: number;
  tokensCount: number;
  driftCount: number;
  summary: {
    totalComponents: number;
    totalTokens: number;
    totalDrift: number;
    driftByType?: Record<string, number>;
    driftBySeverity?: Record<string, number>;
  } | null;
  createdAt: string;
}

export async function uploadScan(
  projectId: string,
  data: UploadScanRequest
): Promise<ApiResponse<UploadScanResponse>> {
  return apiRequest<UploadScanResponse>(`/projects/${projectId}/scans`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listScans(
  projectId: string,
  options?: { limit?: number; offset?: number }
): Promise<ApiResponse<{ scans: Scan[]; total: number }>> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<{ scans: Scan[]; total: number }>(`/projects/${projectId}/scans${query}`);
}

export async function getLatestScan(
  projectId: string,
  includeFull = false
): Promise<ApiResponse<Scan>> {
  const query = includeFull ? '?include=full' : '';
  return apiRequest<Scan>(`/projects/${projectId}/scans/latest${query}`);
}

// ============================================================================
// GitHub Installations API
// ============================================================================

export interface GitHubInstallation {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  avatarUrl: string | null;
  repositorySelection: 'all' | 'selected';
  suspended: boolean;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listGitHubInstallations(): Promise<
  ApiResponse<{ installations: GitHubInstallation[] }>
> {
  return apiRequest<{ installations: GitHubInstallation[] }>('/github/installations');
}

export async function revokeGitHubInstallation(
  id: string
): Promise<ApiResponse<{ success: boolean }>> {
  return apiRequest<{ success: boolean }>(`/github/installations/${id}`, {
    method: 'DELETE',
  });
}

export function getGitHubInstallUrl(endpoint: string): string {
  return `${endpoint}/github/install`;
}

// ============================================================================
// Billing API
// ============================================================================

export interface BillingPlan {
  id: string;
  name: string;
  features: string[];
}

export interface BillingUsage {
  period: string;
  scans: number;
  apiCalls: number;
  storageBytes: number;
}

export interface BillingStatus {
  plan: BillingPlan;
  subscription: {
    id: string;
    customerId: string;
  } | null;
  limits: {
    users: number | null;
    currentUsers: number;
  };
  usage: BillingUsage;
  trial: {
    active: boolean;
    daysRemaining: number;
    endsAt: string;
    converted: boolean;
  } | null;
  paymentAlert: {
    status: string;
    daysRemaining: number;
    graceEndsAt: string;
    failedAt: string;
  } | null;
  cancellation: {
    requestedAt: string;
    reason: string;
  } | null;
}

export interface Invoice {
  id: string;
  number: string;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  createdAt: string;
  hostedUrl: string;
  pdfUrl: string;
}

export async function getBillingStatus(): Promise<ApiResponse<BillingStatus>> {
  return apiRequest<BillingStatus>('/billing');
}

export async function getInvoices(): Promise<ApiResponse<{ invoices: Invoice[] }>> {
  return apiRequest<{ invoices: Invoice[] }>('/billing/invoices');
}

export async function createCheckoutSession(): Promise<
  ApiResponse<{ checkoutUrl: string; sessionId: string }>
> {
  return apiRequest<{ checkoutUrl: string; sessionId: string }>('/billing/checkout', {
    method: 'POST',
  });
}

export async function createPortalSession(): Promise<ApiResponse<{ portalUrl: string }>> {
  return apiRequest<{ portalUrl: string }>('/billing/portal', {
    method: 'POST',
  });
}

export async function requestCancellation(
  reason: string,
  feedback?: string
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  return apiRequest<{ success: boolean; message: string }>('/billing/cancel-request', {
    method: 'POST',
    body: JSON.stringify({ reason, feedback }),
  });
}
