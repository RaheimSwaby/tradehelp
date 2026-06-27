// Bundled patch notes — shown in the "What's new" modal after an update.
// Add an entry here with every release so users always see real notes.
export const RELEASE_NOTES = {
  '0.21.6': `• Fixed CI release-notes generation`,
  '0.21.4': `• Update notifications now work on all platforms — a banner appears when a new version is out with a direct download link\n• Fixed update delivery that was silently broken for Windows users`,
  '0.21.3': `• Update flow is now user-triggered: banner shows when an update is available, click "Update now" to download, then "Restart now" to apply`,
  '0.21.2': `• Heat map advisory now shows best hour and best day as separate chips`,
  '0.21.1': `• Heat map advisory fixed to correctly highlight the single best performing time slot`,
  '0.21.0': `• Performance heat map on the Dashboard — win rate by hour × day with a fire color scale and advisory\n• Playbook tab — document your setups with entry criteria, invalidation, and targets; trades auto-link by setup name`,
  '0.20.3': `• Security: settings write-side key allowlist\n• Security: image upload MIME allowlist blocks SVGs\n• Performance: trade list query rewritten to use a single JOIN\n• Reliability: settings cache invalidated on every write\n• openExternal restricted to http/https URLs only\n• Stream listener cleanup on component unmount\n• getImage returns null on file error instead of crashing\n• Backup errors now logged instead of swallowed`,
}
