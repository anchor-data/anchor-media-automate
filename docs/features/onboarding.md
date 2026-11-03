# Feature: Account onboarding

Adding an account is a stepper in the "アカウント追加" modal. The account is created at step 2; later steps can be skipped and finished afterwards.

| Step | What the owner enters | Stored in |
|---|---|---|
| 1. アカウント | name, Instagram handle | `accounts` (`POST /accounts`) |
| 2. ターゲット・コンセプト | target, concept, tone | guideline (`PUT /accounts/:id/guideline`) |
| 3. デザイン | reference screenshots, link note, written guideline → AI derives the design | `accounts.design_json` (`POST /accounts/:id/design/analyze`) |
| 4. スライド構成 | page roles, 3-10 pages; "参考から推定" or manual | `design_json.structure` (`POST .../structure/analyze`, `PUT .../structure`) |
| 5. スケジュール | auto-run on/off and its schedule | `PUT /accounts/:id/auto-run` |
| 6. 完了 | summary | - |

## Where it shows up afterwards

- Target/concept: エージェント > ペルソナ・ガイドライン
- Schedule, plus a design and structure summary card: エージェント > エージェント設定
- Full design, references, guideline and structure: デザイン

## Notes

- The reference link is only a note; Instagram content is never fetched.
- Design derivation and structure inference cost about $0.008 and $0.014 (measured); the amount is kept in `design_json.analysisCostUsd`.
- `workspace-context.addAccount` returns the new account id so the wizard can continue with it.
