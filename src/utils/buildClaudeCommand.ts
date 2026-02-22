/**
 * Build the shell command to launch/restart/resume/continue Claude.
 *
 * Filters out launch-only flags (--worktree) when resuming or continuing,
 * since the worktree was already created on the initial launch.
 *
 * The invisible OSC sentinel (printf '\033]666;\007') is always appended
 * so the Rust reader thread can detect when Claude exits.
 */
export function buildClaudeCommand(
  claudePath: string,
  storedFlags: string,
  opts?: { resumeId?: string; continue?: boolean },
): string {
  let cmd = `${claudePath} --dangerously-skip-permissions`

  if (opts?.resumeId) {
    cmd += ` --resume ${opts.resumeId}`
  }
  if (opts?.continue) {
    cmd += ` --continue`
  }

  // Filter out launch-only flags when resuming or continuing
  let safeFlags = storedFlags.trim()
  if (safeFlags && (opts?.resumeId || opts?.continue)) {
    safeFlags = safeFlags
      .replace(/--worktree\b/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }
  if (safeFlags) {
    cmd += ` ${safeFlags}`
  }

  cmd += `; printf '\\033]666;\\007'`
  return cmd
}
