# Coach Evidence Evaluation

## Automated Regression Suite

Run `npx vitest run src/renderer/src/__tests__`.

The coach fixtures cover symbol/account isolation, unknown symbols, explicit dates,
relative periods, follow-up scope, missing tags/stops, winning plan deviations,
losing plan followers, conflicting approved corrections, dismissed review findings,
commitment scoping, bounded context, cloud privacy and prior-chat exclusion,
memory edits/deletion/storage failure, citation persistence and deleted trades.

Replies without valid references, with invented reference IDs, or matching the
unsupported-motive guard use a labeled deterministic fallback. Raw answer tokens
are withheld until this check completes. These checks are not a semantic proof:
a model can still misinterpret a valid source or quote an incorrect number.

## Optional Local Model Smoke Test

With Ollama running locally, run:

```sh
node scripts/evaluate-coach-local.mjs qwen2.5:3b
```

This runner uses synthetic fixtures only, never loads the journal database, and
contacts only `127.0.0.1:11434`. It prints raw and displayed answers separately.
Its exit status checks citations, not coaching quality. Review each answer against
the printed expectation: no inferred motives, no outcome-based decision grades,
one useful question or next step, and no invented evidence or profit promises.

The initial qwen2.5:3b smoke test omitted citations and attributed an untagged loss
to emotional factors. This prompted a response gate and regression fixture.
A subsequent test exercised the fallback for a malformed source token and
produced a cited plan-versus-outcome answer for the losing-plan-follower case.

## Privacy and Approval

Approved memory is local and separate from five-day chat history. Only explicit
edits save memory; a model cannot write it. Up to five relevant complete memories
fit into a request, with included/total coverage shown. Budgeting can omit optional
context, never half of a serialized trade record.

Cloud written-journal exclusion removes notes, saved review text, approved memory,
playbook prose, day-log prose, and prior chat from requests. The current question
is still sent to the selected provider. Structured trade tags and numeric fields
remain available. Old assistant answers are never replayed as evidence.

Commitment actions open the existing editable confirmation form, including the
coach response as context. No generated reply starts or replaces a commitment.
Playbook practice opens the existing practice workflow; the coach does not claim
to have inspected screenshots or recordings.
