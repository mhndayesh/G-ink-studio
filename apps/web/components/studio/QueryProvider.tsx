"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 20_000 },
      mutations: { retry: 0 },
    },
  }), []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
