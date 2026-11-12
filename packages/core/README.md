# @tradehelp/core

The trading math every TradeHelp surface must agree on: instrument profiles, position
sizing, R multiples, plan and execution scoring, prop-firm evaluation, and directional bias.

## Rules

- **Pure only.** No React, DOM, `window`, Electron, Expo, or storage access. Functions take
  data and return data, so the same module runs in the desktop renderer, the mobile app,
  Node scripts, tests, and standalone TradeHelp tools.
- **One implementation per calculation.** If two surfaces show the same number, it must come
  from here. Do not re-implement a formula in an app.
- **Version scoring changes.** Stored scores carry a version (for example
  `PLAN_SCORE_VERSION`). Change a formula by adding a new version, never by silently
  altering what existing records mean.

The desktop app keeps its old import paths working through re-export modules in
`src/renderer/src`, so code can migrate to direct `@tradehelp/core` imports gradually.
