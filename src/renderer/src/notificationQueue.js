export const FLOATING_NOTICE_PRIORITY = Object.freeze([
  'risk',
  'update',
  'daily-review',
  'timing',
  'achievement',
  'nudge',
  'feedback'
])

// Select exactly one floating surface. Lower-priority notices stay in their existing
// state/queue until higher-priority work clears, rather than rendering underneath it.
export function selectFloatingNotice({
  risk = false,
  update = false,
  dailyReview = false,
  timing = false,
  achievement = false,
  nudge = false,
  feedback = false,
  blocked = false
} = {}) {
  if (risk) return 'risk'
  if (update) return 'update'
  if (blocked) return null
  if (dailyReview) return 'daily-review'
  if (timing) return 'timing'
  if (achievement) return 'achievement'
  if (nudge) return 'nudge'
  if (feedback) return 'feedback'
  return null
}
