# Feature: Account design

How a post gets its look, without anyone building Canva templates.

## Flow

1. **References.** On the デザイン page the owner adds screenshots of reference posts (up to 8) and optionally a reference account link/handle. The link is only stored as a note: Instagram is never fetched.
2. **Guideline.** A written design guideline (tone, color feel, weight, what to avoid) next to the references. It wins over the references where they disagree.
3. **Derive.** `POST /accounts/:id/design/analyze` sends the screenshots + guideline to a vision model, which returns a `DesignSpec` (colors, type weights, corner radius, decoration, alternate accent colors, how much each post may vary). The spec is validated field by field and passed through a readability guardrail (WCAG contrast; text colors are swapped if unreadable).
4. **Per post.** Each new post gets the account design varied by its id (`varySpec`): accent color from the account's alternates, number alignment, and (when `variety` is `lively`) heading underline and decoration. `variety: none` keeps every post identical.
5. **Regenerate.** In the editor, 「デザインを再生成」 takes a free-text prompt ("番号は左、見出しは下線なし、明るく"). The model returns a partial spec which is merged into the post's current design (the account guideline is part of the prompt). Without a prompt the account design is varied again. Text is never touched.

## Slide structure (page count and roles)

An account has a page structure: an ordered list of page roles (`cover`, `empathy`, `point`, `pick`, `cta`), 3-10 pages, cover first, CTA last, at least one point page. The default is the 8 pages every post used to have.

- Set on the デザイン page (or in the onboarding step): infer it from the reference screenshots (`POST /accounts/:id/structure/analyze`, saved as a proposal) and adjust by hand (`PUT /accounts/:id/structure`, normalized to a valid structure).
- It applies to new posts. A post stores the structure it was made with (`slides_json.structure`; posts without one are the default 8 pages), so editing, regenerating and re-rendering stay consistent after the account's structure changes.
- Field keys stay `s{page}_{name}` (`s3_head`...), so the default structure has exactly the keys it always had. Character limits are per role (`ROLE_FIELDS` in `@ama/shared`).
- The creation agent gets the page list and fills exactly those fields; the renderer, the Canva import and the editor all follow the structure.

## Onboarding

Adding an account is a step-by-step wizard; see [`onboarding.md`](./onboarding.md).

## Where things live

- `@ama/renderer`: `DesignSpec` + guardrails (`spec.ts`), variation (`vary.ts`), reference/prompt → spec (`design.ts`, `nl.ts`), Japanese line wrapping (`wrap.ts`), HTML preview (`html.ts`, used by the デザイン page) and PPTX output (`pptx.ts`, used for Canva).
- `accounts.design_json`: `{ spec, guideline, referenceNote, summary, updatedAt, analysisCostUsd, structure, structureSummary }`.
- `posts.slides_json.design` / `.designPrompt`: the design a post was rendered with and the last prompt.

## Structure and images

- `layout.structure` arranges the content pages: `classic` (number, heading pill, text stacked), `split` (number column + accent rule on the left, heading and text on the right) or `banner` (heading in a colored band on top). With `variety: lively` a post may also switch structure (30% of posts).
- Every page is described once as a flat list of elements (`layoutSlide`); the HTML preview and the PPTX for Canva are both drawn from it, so they match. Text is wrapped at word boundaries by our own code before it is drawn.
- A page with an image (an uploaded asset or an AI illustration chosen by the creation agent) gets an image layout. The whole image is shown (never cropped), centered in its box. Uploaded assets come from R2; AI illustrations use the account's image style prompt (model `gpt-image-1-mini`).

## Cost tracking

Costs are measured from the models' token usage, not estimated: `slides_json.costUsd { copy, images, design }` per post (a regeneration adds to it) and `accounts.design_json.analysisCostUsd` for deriving a design. The editor shows the per-post total.

Measured on the local stack: deriving a design from 3 screenshots about $0.008; copy for one post $0.024-0.032; one AI illustration about $0.034 (it was generated from reference images); rendering and Canva cost nothing.

## Limits

- Canva stores two font weights from a PPTX (normal/bold), so weights 300-900 collapse to two steps there. The HTML preview shows all nine.
- Manual edits in Canva are lost if the slide text is edited in the app afterwards (that creates a new import). Use "プレビューを更新" to re-export after editing in Canva.
- Structure inference is only as good as the number of pages of one post you provide as screenshots.
- The page types (cover / empathy / point / pick / CTA) are fixed in code; the design chooses among a few arrangements of the content pages.
