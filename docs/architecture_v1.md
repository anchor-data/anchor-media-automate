## Overview

![arc](./arch_1.png)

求人データの取得から、投稿生成、画像生成、承認、Instagram 投稿、分析までを一元管理する。

構成上は以下の役割に分ける。

- **Dashboard**：人が確認・承認・操作する
- **Backend**：Business Logic・Validation・Scheduling を実行する
- **Database**：正式なデータを保持する
- **OpenAI Agent**：投稿生成・選定・改善提案を行う
- **Canva**：投稿画像を生成・保持する
- **Instagram API**：投稿・インサイト取得を行う

---

# Main Components

## 1. Next.js Dashboard

**Hosting：Cloudflare**

主な役割：

- 投稿候補一覧
- 投稿プレビュー
- 修正・承認・却下
- 投稿スケジュール管理
- アカウント設定
- 投稿実績・分析の確認

Dashboard は Control Plane として利用し、直接 AI 処理や投稿処理を持たせない。

---

## 2. Backend API

**Cloudflare Workers / Hono**

主な役割：

- Job 管理
- 投稿生成の Trigger
- Business Logic
- Validation
- Scheduling
- Canva / Instagram / OpenAI との API 連携

承認・予約投稿・ステータス変更など、確実に実行する必要がある処理は Backend 側で管理する。

---

## 3. Database

**Turso / libSQL**

System 全体の **Source of Truth** として利用する。

主なデータ：

- `accounts`
  - Instagram アカウント設定
  - 投稿条件
  - テンプレート
  - 投稿頻度
- `jobs`
  - 求人データ
  - 会社名
  - 職種
  - 給与
  - 勤務地
  - 求人 URL
- `posts`
  - 投稿案
  - Caption
  - Status
  - Scheduled At
  - Instagram Post ID
- `post_assets`
  - Canva Design ID
  - Canva Export URL
  - 使用テンプレート
- `metrics`
  - Reach
  - Like
  - Save
  - Share
  - Follow
- `agent_sessions`
  - OpenAI Agent Session ID

---

## 4. OpenAI Agents API

投稿生成・選定・改善提案など、知的処理を担当する。

主な Tools（Backend 定義・Agent はこれ経由のみ）：

**Ideation（実装済み / OpenAI Agents SDK）**

- `get_guideline()` — 人間が Dashboard で編集したガイドライン
- `list_references()` — 人間がアップロードした参照（構造・フック等）
- `get_memory()` — 重複防止・却下学習
- `get_previous_posts()`
- `check_duplicate()`
- `get_candidate_jobs()` — 任意（求人なしでも企画可能）

**Creation（Phase 3 で Agents 化）**

- `create_post_draft()` / `submit_deck()`
- `regenerate_post()`

Agent から DB を直接自由に操作させるのではなく、Backend 側で定義した限定的な Tool を経由して処理する。書き込み（ideas / posts / memory）は API が確定する。

Agent の主な役割：

- 投稿候補の企画（Ideation）
- Carousel 構成生成・Caption 生成（Creation）
- 過去投稿・メモリーを踏まえた改善提案

---

## 5. Canva Autofill API

求人データと AI 生成コンテンツをテンプレートに差し込み、Instagram 用の Carousel 画像を生成する。

生成画像は Canva 上で管理し、DB には以下の参照情報を保存する。

- Canva Design ID
- Export URL
- Template ID
- Post ID

MVP では Cloudflare R2 等の追加 Storage は使用しない。

---

## 6. Instagram Graph API

主な役割：

- 承認済み投稿の予約投稿
- 投稿実行
- Instagram Post ID 取得
- 投稿実績・Insight 取得

取得した実績は Turso に保存し、Dashboard の分析画面に反映する。

---

# System Flow

```
Job Source
API / CSV / Scraper
        ↓
Backend API
Cloudflare Workers / Hono
        ↓
Turso / libSQL
        ↓
OpenAI Agents API
        ↓
投稿案生成
        ↓
Canva Autofill API
        ↓
Carousel画像生成
        ↓
Dashboardで確認・承認
        ↓
Instagram Graph API
        ↓
投稿
        ↓
Metrics取得
        ↓
Tursoへ保存
        ↓
Dashboardで分析
```

---

# Operational Flow

1. **求人取得**

   外部サービスから求人情報を取得する。

2. **選定**

   アカウント設定や条件に基づいて投稿対象を選定する。

3. **投稿生成**

   OpenAI Agent が Caption・Carousel 構成を生成する。

4. **画像生成**

   Canva Autofill API で投稿画像を生成する。

5. **承認**

   Dashboard で人が内容を確認・修正・承認する。

6. **投稿**

   承認済み投稿を Instagram へ予約・投稿する。

7. **分析**

   投稿実績を取得し、次回の投稿改善に利用する。

---

# v1.1 Addendum: AI Ideation (first build scope)

First implementation scope prioritizes **AI content ideation + 8-slide creation**, ending at **approve → schedule**. Instagram publish and metrics remain as in v1 but are not built yet.

## Changes relative to the job-centric flow above

| v1 step | v1.1 first scope |
|---|---|
| 1. 求人取得 | Optional later. Not required to ideate. |
| 2. 選定 | **AI ideation** from human **guideline** + **reference** + system **memory** |
| 3–5 | Unchanged in spirit: agent draft → Canva → human approve |
| 6–7 | Deferred (store `scheduled` / `scheduled_at` only) |

## Human-owned inputs (Dashboard)

- **Guideline** — target, concept, tone, pillars, NG rules, CTA/hashtag policy, system prompt (uploaded/edited by humans)
- **Reference** — slide/hook/voice patterns and docs (uploaded/managed by humans; inspired-by structure only)

## System memory

Written by Backend on approve/reject (and later edits). Used by the ideation agent to avoid duplicates.

## Agent tools (ideation-first)

- `get_guideline`, `list_references`, `get_memory`, `get_previous_posts`, `check_duplicate`, optional `get_candidate_jobs`, `submit_ideas`
- Creation: `get_idea`, `submit_deck`, plus guideline/reference (and optional job)

## New / extended data (see `packages/db/sql/schema.sql`)

- `guidelines`, `references`, `memory_items`, `ideas`
- `posts`: `idea_id`, `slides_json`, `scheduled_at`, generation fields
- `post_assets`: `slide_index`, `template_id`

Detail: `docs/features/content-ideation.md`, `docs/features/content-creation.md`, `docs/phase-0-feasibility.md`.
