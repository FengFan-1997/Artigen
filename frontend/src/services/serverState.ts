import { QueryClient } from '@tanstack/vue-query';

type HttpLikeError = Error & { status?: number; retryable?: boolean };

export class ServerStateHttpError extends Error {
  status: number;

  constructor(status: number, message = `HTTP_${status}`) {
    super(message);
    this.name = 'ServerStateHttpError';
    this.status = status;
  }
}

export const shouldRetryServerQuery = (failureCount: number, error: unknown) => {
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  const candidate = error as HttpLikeError;
  const status = Number(candidate?.status || 0);
  if (status >= 400 && status < 500) return false;
  if (candidate?.retryable === false && status > 0) return false;
  // TanStack passes zero for the first failed attempt. Two retries means at
  // most three total requests for a transient network/5xx failure.
  return failureCount < 2;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryServerQuery,
      staleTime: 0,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true
    },
    mutations: {
      retry: false
    }
  }
});

export const clearAuthenticatedServerState = () => {
  queryClient.removeQueries({
    predicate: (query) => ['auth', 'credits', 'tool-task', 'history', 'console']
      .includes(String(query.queryKey[0] || ''))
  });
};

export const fetchJsonQuery = async <T>(input: {
  queryKey: readonly unknown[];
  request: (signal: AbortSignal) => Promise<Response>;
  staleTime?: number;
}): Promise<T> => queryClient.fetchQuery({
  queryKey: [...input.queryKey],
  staleTime: input.staleTime ?? 0,
  queryFn: async ({ signal }) => {
    const response = await input.request(signal);
    const json: any = await response.json().catch(() => null);
    if (!response.ok) {
      const code = typeof json?.error?.code === 'string'
        ? json.error.code
        : typeof json?.error === 'string'
          ? json.error
          : `HTTP_${response.status}`;
      throw new ServerStateHttpError(response.status, code);
    }
    return json as T;
  }
});
