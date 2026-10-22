# How to add an account (with the Canva setup)

Each Instagram account renders its carousels from **one Canva brand template**. The Canva connection itself is set up once for the whole app; the template is chosen per account.

```
One-time (per workspace)           Per account
┌──────────────────────────┐      ┌─────────────────────────────────────┐
│ A. Canva integration     │      │ B. Build + publish brand template   │
│ C. Authorize (bootstrap) │ ───▶ │ D. Add account, pick the template   │
└──────────────────────────┘      │ E. Fill guideline, generate content │
                                  └─────────────────────────────────────┘
```

## Prerequisites

- A **Canva Enterprise** account (brand templates and autofill are Enterprise-only)
- Turso configured (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) and `OPENAI_API_KEY` set
- Schema applied: `pnpm --filter @ama/db setup:turso`

## A. Create the Canva integration (once)

In the [Canva developer portal](https://www.canva.com/developers/):

1. Create an **Integration** (Connect app).
2. **Authentication → Authorized redirects**: add exactly `http://127.0.0.1:8765/callback`
   (`127.0.0.1`, not `localhost`; no trailing slash). Other redirect URLs on the same client can stay.
3. **Scopes**: enable all five
   - `design:meta:read`
   - `design:content:read`
   - `design:content:write`
   - `brandtemplate:meta:read`
   - `brandtemplate:content:read`
4. Generate a client secret. Put `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` in the repo-root `.env`, and set the same values on the API worker.

## C. Authorize once

```
pnpm --filter @ama/db canva:bootstrap
```

1. Leave the terminal running (it waits 5 minutes on port 8765).
2. Open the printed URL and approve with the Canva Enterprise user.
3. Success looks like: browser shows "Canva auth complete", terminal prints "refresh token stored in the canva_tokens table".

Canva rotates the refresh token on every use, so the live token lives in the `canva_tokens` table, not in env. `CANVA_REFRESH_TOKEN` is an optional seed only. Re-run the script if you ever revoke the integration.

## B. Build the brand template (per account, or share one)

### Start from a reference account (optional)

In **アカウント追加 → Canvaテンプレート → 参考アカウントから新しいテンプレートを作成**:

1. Enter the reference Instagram profile link (`https://www.instagram.com/<handle>` or `@handle`).
2. Upload screenshots of **one** reference carousel, in slide order (up to 10). Instagram cannot be read by the server, so the screenshots are what define the structure: a vision model (`gpt-4.1`, needs `OPENAI_API_KEY`) returns the page count, each page's role and its text boxes. Without screenshots or a key, the standard 8-page deck is used.
3. Optionally add asset URLs (logo, photos) and style notes. They are written into the brief; they are not uploaded to Canva.
4. **Canvaに下書きを作成** (`POST /canva/template-drafts`) imports a generated PDF into Canva as a **multi-page 1080×1350 design**, one page per inferred slide, each listing its field names. The response carries the edit link, a markdown brief and the inferred structure.
5. In Canva, lay the pages out in the reference style, then continue with the steps below (tag the fields, publish).
6. Back in the modal press **公開したので一覧を更新**, pick the new template, and add the account. The template id is stored on the account (`canva_template_id`) exactly as in section D.

The Canva Connect API cannot add elements, name autofill fields or publish a brand template, so steps 5-6 stay manual.

**Limit:** account creation (`checkTemplate`) and the creation agent still require the fixed 21-field, 8-page contract. A draft inferred with a different page count can be built in Canva, but it will be rejected when linked until `slideFieldsSchema` and the creation agent accept variable structures.

### Build it in Canva

Spec: [features/canva-template-spec.md](features/canva-template-spec.md). In short:

1. Create an **8-page, 1080×1350 (4:5)** design.
2. Name every text element with the **Data autofill** app, using exactly these 21 names:

   | Page | Fields |
   |---|---|
   | 1 Cover | `s1_title`, `s1_sub` |
   | 2 Empathy | `s2_head`, `s2_body` |
   | 3–6 Points | `s3_num`, `s3_head`, `s3_body` … `s6_num`, `s6_head`, `s6_body` |
   | 7 Job pick / summary | `s7_label`, `s7_head`, `s7_body` |
   | 8 CTA | `s8_head`, `s8_cta` |

3. **Publish as a brand template**. Use original visuals only (no third-party logos or characters).

Character limits per field are enforced in `@ama/shared` (`slideDeckSchema`); keep text boxes large enough for them.

## D. Add the account

In the dashboard: **アカウント追加**

1. Enter the Instagram handle, schedule, target and concept.
2. Choose the **Canvaテンプレート** from the dropdown. It lists the brand templates the authorized Canva user can see.
3. Submit. The API checks that the template exposes all 21 fields and rejects it with the missing field names if not.

This creates the account (`POST /accounts`) and a first guideline from the target and concept (empty values become `未設定`).

To change the template later: **エージェント設定 → Canvaテンプレート → テンプレートを適用** (`PUT /accounts/:id/canva-template`, same validation).

Without the UI, you can set it directly:

```sql
UPDATE accounts SET canva_template_id = '<brand template id>' WHERE id = '<account id>';
```

The seeded account `acc_001` ships with the placeholder `tpl_wakaru_explainer_v1`, which does not exist in Canva. Select a real template for it before generating.

## E. Finish the setup and generate

1. **エージェント設定**: set tone, NG rules, CTA and hashtag policy, and add reference material.
2. Run ideation, pick an idea, and click **このアイデアでコンテンツを作成**.
3. The post goes `pending → generating_copy → rendering → ready`. The 8 slide images appear in the post detail panel.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Browser: `127.0.0.1 refused to connect` after approving | `canva:bootstrap` was no longer running | Re-run it and approve within 5 minutes |
| `redirect uri doesn't match any of the stored uris` | Redirect URL not registered on the integration | Add `http://127.0.0.1:8765/callback` (step A.2) |
| `invalid_scope` on the consent page | A scope is not enabled | Enable all five scopes (step A.3) |
| `Invalid brand template ID tpl_wakaru_explainer_v1` | Account still has the seed placeholder | Select a real template (step D) |
| `Template is missing autofill fields: …` | Elements not named, or misspelled | Fix names in Canva, re-publish, re-apply |
| Template dropdown shows "テンプレート一覧を取得できません" | Authorization missing or expired | Run `canva:bootstrap` again |
| Preview images do not load | Signed export URLs expire | Press **プレビューを更新** in the post panel |
| Images are placeholders from `images.example.com` | Canva client in mock mode (credentials or Turso missing) | Set the Canva env vars and Turso, then restart the API |
