# Coach retrieval work

## Boundaries

- Read-only access. Do not change trades, plans, notes, reviews or commitments.
- Search locally first. Respect written-record privacy settings before assembling model context.
- Calculate statistics in app code over the full selected population, before sampling.
- Distinguish absent records, no text matches, disabled access and failed searches. No text match does not establish that an event was never recorded in other words.

## First implementation

- [x] Expand whole-journal scope phrases and discard inherited session scope for these requests.
- [x] Preserve explicit account, symbol and date filters.
- [x] Search full available trade-note text plus saved reviews, daily notes and playbook text locally.
- [x] Send bounded, cited excerpts and disclose truncation and search coverage.
- [x] Provide monthly statistics calculated from all matching trades.
- [x] Spread whole-journal trade examples across the timeline.
- [x] Verify targeted real-model scope and note-search behavior with synthetic data: January-to-October totals and retrieval beyond the old 500-character cutoff.
- [x] Reject direct trade-date citation mismatches, with regression coverage for the swapped-citation reproduction.
- [ ] Broader semantic validation remains open: the model can still overinterpret missing plan fields. The targeted date guard and citation syntax checks do not prove overall factual accuracy.

## Next implementation steps

- Add read-only model-requested retrieval operations: search records, get trade, get session and get review, with schema validation and bounded rounds.
- Add complete-record retrieval with explicit size limits and pagination rather than treating excerpts as full records.
- Persist focused record IDs and scope separately from model text, including citation references across turns.
- Add similar-trade comparisons with app-calculated population totals and disclosed selection criteria.
- Compare commitment results before and after adoption only where dates and linked evidence support the comparison.
- Add opt-in image analysis for a supported vision provider. Require explicit image-sharing permission. Current previews remain local and unseen by the model.

## Known limits

Search currently operates on the records loaded into the app, not arbitrary files or every database table. It uses literal text matching, not semantic search. Reviews and playbook records are global context; daily notes have no account association. The model cannot initiate further searches yet. No automatic writes or image uploads are introduced.
