import { describe, expect, it } from 'vitest'
import {
  buildDailyReport,
  coachVoiceInstruction,
  dailyReportAiPayload,
  normalizeCoachVoice,
  proactiveCoachPayload,
  shouldIncludeWrittenJournal
} from '../coachInsights.js'

const report = buildDailyReport([
  { symbol: 'MES', pnl: -25, emotion: 'Revenge', setup: 'ORB', timestamp: '2026-07-15 09:30' }
], '2026-07-15')

describe('coach voice', () => {
  it.each(['supportive', 'balanced', 'tough-love'])('supports the %s setting value', (voice) => {
    expect(normalizeCoachVoice(voice)).toBe(voice)
    expect(coachVoiceInstruction(voice)).toContain(`Delivery style (${voice})`)
  })

  it('falls back to balanced for missing or unknown values', () => {
    expect(normalizeCoachVoice()).toBe('balanced')
    expect(normalizeCoachVoice('harsh')).toBe('balanced')
  })

  it('changes daily-review delivery instructions without changing evidence or safety rules', () => {
    const supportive = dailyReportAiPayload(report, 'supportive')
    const tough = dailyReportAiPayload(report, 'tough-love')
    expect(supportive.messages).toEqual(tough.messages)
    expect(supportive.system).toContain('Delivery style (supportive)')
    expect(tough.system).toContain('Delivery style (tough-love)')
    expect(supportive.system).toMatch(/No market predictions or buy\/sell advice/)
    expect(tough.system).toMatch(/No market predictions or buy\/sell advice/)
    expect(tough.system).toMatch(/never insulting, shaming, or alarmist/i)
  })

  it('changes proactive delivery without changing the rule-based facts', () => {
    const brief = { strength: 'Followed stops.', focus: 'Avoid revenge trades.' }
    const balanced = proactiveCoachPayload('journal facts', brief, 'balanced')
    const tough = proactiveCoachPayload('journal facts', brief, 'tough-love')
    expect(balanced.messages).toEqual(tough.messages)
    expect(tough.messages[0].content).toContain('Strength: Followed stops.')
    expect(tough.messages[0].content).toContain('Focus: Avoid revenge trades.')
    expect(tough.system).toMatch(/Do not give market predictions, buy\/sell advice, or promise profits/)
  })
})

describe('written journal privacy', () => {
  it('keeps all written context local when cloud access is disabled', () => {
    expect(shouldIncludeWrittenJournal({ provider: 'cloud', cloudJournalAccess: 'false' })).toBe(false)
  })

  it('preserves the existing default for cloud and local providers', () => {
    expect(shouldIncludeWrittenJournal({ provider: 'cloud' })).toBe(true)
    expect(shouldIncludeWrittenJournal({ provider: 'ollama', cloudJournalAccess: 'false' })).toBe(true)
  })
})


describe('AI caller payload propagation', () => {
  it('forwards coach voice through proactive and daily report callers without changing facts or safety guidance', async () => {
    const [{ buildCoachBriefAiPayload }, { buildDailyReportAiPayload }] = await Promise.all([
      import('../components/CoachBriefCard.jsx'),
      import('../components/DailyReport.jsx')
    ])
    const brief = { strength: 'Followed stops.', focus: 'Avoid revenge trades.' }
    const proactiveSupportive = buildCoachBriefAiPayload('journal facts', brief, { coachVoice: 'supportive' })
    const proactiveTough = buildCoachBriefAiPayload('journal facts', brief, { coachVoice: 'tough-love' })
    expect(proactiveSupportive.messages).toEqual(proactiveTough.messages)
    expect(proactiveSupportive.system).toContain('Delivery style (supportive)')
    expect(proactiveTough.system).toContain('Delivery style (tough-love)')
    expect(proactiveSupportive.system).toMatch(/Do not give market predictions, buy\/sell advice, or promise profits/)
    expect(proactiveTough.system).toMatch(/Do not give market predictions, buy\/sell advice, or promise profits/)

    const dailySupportive = buildDailyReportAiPayload(report, { coachVoice: 'supportive' })
    const dailyTough = buildDailyReportAiPayload(report, { coachVoice: 'tough-love' })
    expect(dailySupportive.messages).toEqual(dailyTough.messages)
    expect(dailySupportive.system).toContain('Delivery style (supportive)')
    expect(dailyTough.system).toContain('Delivery style (tough-love)')
    expect(dailySupportive.system).toMatch(/No market predictions or buy\/sell advice/)
    expect(dailyTough.system).toMatch(/No market predictions or buy\/sell advice/)
  })

  it('applies review voice and cloud written-journal privacy while preserving factual context', async () => {
    const [{ buildReviewSummaryPayload }, { computeStats }] = await Promise.all([
      import('../tabs/ReviewsTab.jsx'),
      import('../stats.js')
    ])
    const periodTrades = [{
      symbol: 'MES', pnl: 25, notes: 'private review note', timestamp: '2026-07-15 09:30'
    }]
    const stats = computeStats(periodTrades)
    const privateSettings = { provider: 'cloud', cloudJournalAccess: 'false', coachVoice: 'tough-love' }
    const privatePayload = buildReviewSummaryPayload({ periodTrades, stats, periodLabel: 'Weekly', settings: privateSettings })
    expect(privatePayload.system).toContain('Delivery style (tough-love)')
    expect(privatePayload.system).toMatch(/No price predictions or buy\/sell advice/)
    expect(privatePayload.messages[0].content).toContain('symbol=MES')
    expect(privatePayload.messages[0].content).not.toContain('private review note')

    const writtenPayload = buildReviewSummaryPayload({
      periodTrades,
      stats,
      periodLabel: 'Weekly',
      settings: { provider: 'ollama', cloudJournalAccess: 'false', coachVoice: 'supportive' }
    })
    expect(writtenPayload.messages[0].content).toContain('private review note')
    expect(writtenPayload.messages[0].content.replace(' | notes=private review note', ''))
      .toBe(privatePayload.messages[0].content)
  })
})