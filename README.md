# Keyword Researcher (Grow My Ads)

AI-assisted Google Ads workflow for:

1. Discovering services from a business website.
2. Researching keyword ideas (Google Ads + competitor context).
3. Applying strategy filters and optional AI enhancement.
4. Building campaign/ad-group/keyword structure.
5. Exporting usable CSV files for Google Ads Editor and analysis.

## Core Objective

Given a target website and market, produce campaign output that is:

1. Logically consistent with user selections (services, geo, strategy, negative keyword choices).
2. Internally consistent across steps (research, review, campaign build, export/import).
3. Immediately usable in Google Ads workflows (Editor import or direct API creation).

## Stack

- Next.js App Router
- React + TypeScript
- Google Ads API
- OpenRouter (Perplexity + model-based enhancement)
- `iron-session` for auth session state

## Local Setup

Install dependencies:

```bash
npm install
```

Run dev server:

```bash
npm run dev
```

Lint:

```bash
npm run lint
```

Build:

```bash
npm run build
```

## Required Environment Variables

Server-side:

- `SESSION_SECRET` (must be at least 32 characters)
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`

Optional (deployment and token compatibility):

- `NEXT_PUBLIC_APP_URL`
- `GOOGLE_ADS_ORIG_CLIENT_ID`
- `GOOGLE_ADS_ORIG_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN` (for `/api/auth/dev-login`)
- `GOOGLE_ADS_CUSTOMER_ID` (for `/api/auth/dev-login`)
- `OPENROUTER_ENHANCE_MODEL` (default: `google/gemini-2.5-pro`, used for AI enhancement phases)

User-provided in app:

- OpenRouter API key (entered in Setup step and stored in browser localStorage)

## Output Files

- `google_ads_editor_import.csv`: Editor-compatible campaign/ad-group/keyword + negatives export.
- `campaign_analysis.csv`: Extended metrics/prioritization export for review and planning.

## Notes

- Campaigns are built as paused by default for safe review.
- Negative keyword selections in Review are treated as user intent and carried into campaign generation.
- Multi-location geo targeting is preserved for both research and direct Google Ads import.
