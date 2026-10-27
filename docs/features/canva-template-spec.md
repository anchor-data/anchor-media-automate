# Canva template spec: wakaru-explainer hybrid v1

## Intent

Brand template for **inspired-by** わかる転職-style carousels. Fixed **8 pages**, **1080×1350 (4:5)**.

Humans register the brand template ID on the account (`canva_template_id`). Autofill field names must match this document.

## Auth prerequisites (see also phase-0-feasibility)

Autofill requires a token that acts **on behalf of a Canva Enterprise user** (OAuth authorization code + PKCE), not client-credentials alone. Client ID/secret in env are still required for the token exchange.

Docs: [Autofill guide](https://www.canva.dev/docs/connect/autofill-guide/), [Create autofill job](https://www.canva.dev/docs/connect/api-reference/autofills/create-design-autofill-job/).

## Field naming

All fields are Canva **text** data fields.

| Page | Fields | Max chars (fits the box) |
|---|---|---|
| 1 Cover | `s1_title`, `s1_sub` | 20 / 11 |
| 2 Empathy | `s2_head`, `s2_body` | 6 / 33 |
| 3 Point | `s3_num`, `s3_head`, `s3_body` | 1 / 4 / 42 |
| 4 Point | `s4_num`, `s4_head`, `s4_body` | 1 / 5 / 40 |
| 5 Point | `s5_num`, `s5_head`, `s5_body` | 1 / 6 / 45 |
| 6 Point | `s6_num`, `s6_head`, `s6_body` | 1 / 5 / 40 |
| 7 Hybrid | `s7_label`, `s7_head`, `s7_body` | 4 / 5 / 36 |
| 8 CTA | `s8_head`, `s8_cta` | 8 / 7 |

The limits live in `SLIDE_FIELD_LIMITS` (`@ama/shared`); the zod schema, the creation agent's instructions and the mock agent all read them, and `slide-limits.test.ts` pins them to the capacities above. They match the **wakaru carousel template** (Canva brand template `EAHYv4kVYQw`): Canva autofill does not shrink text, so copy longer than a box overflows. Re-measure and update the test if you widen or restyle a box.

`s7_*` uses the same layout for **job_pick** and **summary fallback** so one brand template covers the hybrid type.

Optional footer text (handle, page numbers) can be static in the Canva design rather than autofilled.

## Optional image fields

**Set up once per new template (a manual step, the Connect API cannot add fields).** Add Canva **image** data fields `s1_image` … `s8_image` (one per page, any subset) to let the creation agent place uploaded images (dashboard → Engine settings → 画像ライブラリ). Slots the template does not expose are skipped, so text-only templates keep working.

- Images are uploaded to Canva (`POST /v1/asset-uploads`, scopes `asset:read` + `asset:write` (the upload job is polled via `GET /v1/asset-uploads/:id`) — enable both in the Canva developer portal and **re-run the OAuth bootstrap** so the refresh token carries them) and referenced as `{ "type": "image", "asset_id": "…" }`.
- Bytes live in the R2 bucket bound as `IMAGE_ASSETS`; the Canva asset id is cached on the `image_assets` row.
- Run `db setup` to create the `image_assets` table.

## Autofill payload shape

```json
{
  "brand_template_id": "…",
  "data": {
    "s1_title": { "type": "text", "text": "…" },
    "s1_sub": { "type": "text", "text": "…" }
  }
}
```

## Draft generation (new accounts)

`POST /canva/template-drafts` body: `referenceUrl`, `screenshots[]` (image data URLs / https), `assetUrls[]`, `styleNotes`.

- `referenceUrl` must be an Instagram profile link or `@handle` (post, reel and story links are rejected).
- Structure: `inferTemplateStructure` reads the screenshots with a vision model and returns pages of `{ title, purpose, fields[{ name, maxChars }] }`. Field names are `s{page}_{kind}` with kind one of `title | sub | head | body | num | label | cta`. Max 10 pages; names must be unique. No key or no screenshots → `DEFAULT_TEMPLATE_STRUCTURE` (the 8 pages / 21 fields above).
- Draft: `buildDraftPdf` makes one 1080×1350 page per structure page; `POST /v1/imports` creates the Canva design (scope `design:content:write`). With no structure a blank custom-size design is created instead.
- Response: `{ draft: { designId, editUrl }, brief, structure, mode }`.
- Needs a human afterwards: layout, field tagging, publishing as a brand template.

Not verified against live Canva yet: the PDF import path is covered by unit tests with a faked `fetch`, so run one real draft before relying on it.

## Export

- Format: PNG
- Expect **8 URLs** (one per page); store each in `post_assets.slide_index` 0–7
- URLs expire → keep `canva_design_id` and re-export

## Registration checklist

1. Create 8-page 4:5 brand template in Canva Enterprise
2. Name text fields exactly as above
3. Confirm dataset via Get brand template dataset API
4. Save template id on account
5. Run one mock-filled autofill in staging before enabling live creation

## IP

Do not embed third-party logos or characters. Visual style may be inspired by the genre; assets must be original.
