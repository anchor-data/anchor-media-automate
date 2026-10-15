# Canva template spec: wakaru-explainer hybrid v1

## Intent

Brand template for **inspired-by** わかる転職-style carousels. Fixed **8 pages**, **1080×1350 (4:5)**.

Humans register the brand template ID on the account (`canva_template_id`). Autofill field names must match this document.

## Auth prerequisites (see also phase-0-feasibility)

Autofill requires a token that acts **on behalf of a Canva Enterprise user** (OAuth authorization code + PKCE), not client-credentials alone. Client ID/secret in env are still required for the token exchange.

Docs: [Autofill guide](https://www.canva.dev/docs/connect/autofill-guide/), [Create autofill job](https://www.canva.dev/docs/connect/api-reference/autofills/create-design-autofill-job/).

## Field naming

All fields are Canva **text** data fields.

| Page | Fields | Suggested max chars |
|---|---|---|
| 1 Cover | `s1_title`, `s1_sub` | 22 / 24 |
| 2 Empathy | `s2_head`, `s2_body` | 18 / 60 |
| 3 Point | `s3_num`, `s3_head`, `s3_body` | 2 / 16 / 80 |
| 4 Point | `s4_num`, `s4_head`, `s4_body` | 2 / 16 / 80 |
| 5 Point | `s5_num`, `s5_head`, `s5_body` | 2 / 16 / 80 |
| 6 Point | `s6_num`, `s6_head`, `s6_body` | 2 / 16 / 80 |
| 7 Hybrid | `s7_label`, `s7_head`, `s7_body` | 12 / 20 / 80 |
| 8 CTA | `s8_head`, `s8_cta` | 40 / 24 |

`s7_*` uses the same layout for **job_pick** and **summary fallback** so one brand template covers the hybrid type.

Optional footer text (handle, page numbers) can be static in the Canva design rather than autofilled.

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
