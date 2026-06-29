// Self-hosted instance: the floating "Join the Discord Community" pill is
// disabled. Kept as a no-op export so call sites (App init) stay unchanged.
// Restore the upstream implementation from git history to re-enable it.
export function mountCommunityWidget(): void {
  // no-op
}
