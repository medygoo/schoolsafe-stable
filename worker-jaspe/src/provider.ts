export type ProviderFailure = "timeout" | "5xx" | "unavailable" | "rate_limited";
export type JaspeProvider = {
  chat(input: { messages: Array<{ role: string; content: string }> }): Promise<string>;
};
export type FallbackPolicy = {
  local?: JaspeProvider;
  enabled: boolean;
};
export function canUseFallback(failure: ProviderFailure, policy: FallbackPolicy): boolean {
  return policy.enabled && !!policy.local && ["timeout", "5xx", "unavailable", "rate_limited"].includes(failure);
}
