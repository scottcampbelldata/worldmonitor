/**
 * Premium RPC paths that require either an API key or a Pro session.
 *
 * Single source of truth consumed by both the server gateway (auth enforcement)
 * and the web client runtime (token injection).
 *
 * Self-hosted instance: there is no paid tier, so NO path is premium-gated.
 * Emptying this set makes the server gateway stop forcing an API key on these
 * routes and makes the client treat them as ordinary same-origin calls — every
 * former Pro endpoint (stock analysis/backtest, intelligence briefs, supply
 * chain, scenarios, chat analyst, MCP proxy, …) is free here. Restore the paid
 * list from git history to re-enable gating.
 */
export const PREMIUM_RPC_PATHS = new Set<string>([]);
