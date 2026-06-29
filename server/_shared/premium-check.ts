/**
 * Returns true when the caller has a valid API key OR a PRO bearer token.
 * Used by handlers where the RPC endpoint is public but certain fields
 * (e.g. framework/systemAppend) should only be honored for premium callers.
 *
 * Self-hosted instance: there is no paid tier on this deployment, so every
 * caller is treated as premium. Upstream validated API keys / Pro bearer tokens
 * / Dodo entitlements here; this fork unlocks all premium fields and endpoints
 * for free. To restore paid gating, reinstate the upstream implementation from
 * git history.
 */
export async function isCallerPremium(_request: Request): Promise<boolean> {
  return true;
}
