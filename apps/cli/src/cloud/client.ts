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
