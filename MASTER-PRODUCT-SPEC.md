# MASTER PRODUCT SPEC: FreeReverseColoring.com

**Version:** 1.0
**Date:** March 2, 2026
**Author:** Product Manager
**Status:** Ready for Engineering Execution
**Source:** VISION.md (1-Year Strategic Vision)

---

## Table of Contents

- [Part 1: Product Requirements](#part-1-product-requirements)
  - [Phase 1: Relaunch & Automate (Months 1-3)](#phase-1-relaunch--automate-months-1-3)
  - [Phase 2: Grow & Engage (Months 4-6)](#phase-2-grow--engage-months-4-6)
  - [Phase 3: Monetize (Months 7-9)](#phase-3-monetize-months-7-9)
  - [Phase 4: Scale (Months 10-12)](#phase-4-scale-months-10-12)
- [Part 2: Workstream Decomposition](#part-2-workstream-decomposition)
- [Part 3: Dependency Map](#part-3-dependency-map)
- [Part 4: API Contracts](#part-4-api-contracts)

---

## Current State Assessment

Before defining requirements, here is a verified inventory of what exists today.

### What We Have

| Asset | State | Location |
|-------|-------|----------|
| **Static website** | Live on S3/CloudFront. Mobirise-generated HTML. 6 hardcoded designs with Print/Download buttons. Substack iframe for email signup. FAQs. No user accounts, no gallery, no database. | `ReverseColoringWebsiteRepo/index.html` |
| **CDK stack** | S3 bucket (public read), CloudFront distribution (120s cache TTL), CodePipeline from CodeCommit, Route53 DNS (freereversecoloring.com + www), ACM wildcard cert. No Lambda, no DynamoDB, no API Gateway, no SES, no EventBridge. | `CdkFreeReverseColoringRepo/lib/cdk_free_reverse_coloring_repo-stack.ts` |
| **AI generation script** | Local Node.js script (`index.mjs`). Uses the OpenAI SDK directly with GPT-4o (structured JSON outputs) for theme/description generation and gpt-image-1 for native image generation. Runs manually from CLI. Has generated 12 weeks of themes, ~30 painting descriptions (JSON files in `data/week-N/`), and images for weeks 1-2, 4, 6-12 (PNG files in `images/week-N/`). Dependencies: openai ^4.80.0, axios, dotenv. | `ReverseColoringAppAI/index.mjs` |
| **Generated content** | 12 theme-weeks defined in `themes.json`. ~2-5 painting descriptions per week (JSON). ~3-5 images per week (PNG). Total: ~30 descriptions, ~40 images. | `ReverseColoringAppAI/data/` and `images/` |
| **Substack newsletter** | 3 published issues, stopped May 2024. Subscriber count unknown (locked in Substack). | `reversecoloring.substack.com` |
| **Second domain** | `freereversecoloringpages.com` exists but is essentially a duplicate. Unclear email capture (Formoid form). | Not in repo |
| **Revenue** | $0. | N/A |
| **Analytics** | Google Analytics GA4 property `G-ERGD1FQ73M` on main site only. | Hardcoded in index.html |

### What We Do NOT Have

- User accounts or authentication
- Database (DynamoDB or otherwise)
- Own email system (SES, transactional, or bulk)
- API Gateway or Lambda functions
- EventBridge automation
- Content management / admin interface
- Community features (gallery, uploads, sharing)
- Mobile experience (PWA or native)
- Payment infrastructure (Stripe or otherwise)
- Personalization or preference system
- Difficulty levels or content tagging
- Search or filtering

---

## Part 1: Product Requirements

### Phase 1: Relaunch & Automate (Months 1-3)

**Theme:** "Make the machine run itself."

**Success Criteria:**
- Automated weekly email going out every Wednesday without manual intervention
- 100% of new subscribers captured in our own DynamoDB (zero Substack dependency)
- New website live with gallery of all generated designs
- Baseline metrics established for all key KPIs
- Target: 500 email subscribers by end of Phase 1

---

#### P1-F01: Subscriber DynamoDB Table

**User Story:** As a product operator, I want all subscriber data stored in a DynamoDB table I control, so that I own the subscriber relationship and can build features on top of it without third-party lock-in.

**Acceptance Criteria:**
1. DynamoDB table `Subscribers` created via CDK with the following schema:
   - Partition Key: `email` (String)
   - Attributes: `subscriberId` (UUID), `name` (String, optional), `status` (enum: `pending_confirmation` | `active` | `unsubscribed` | `bounced` | `complained`), `signupSource` (String), `signupDate` (ISO 8601), `confirmationDate` (ISO 8601, nullable), `confirmationToken` (String), `preferences` (Map: theme interest checkboxes), `lastEmailSentDate` (ISO 8601), `lastEmailOpenedDate` (ISO 8601, nullable), `bounceCount` (Number), `unsubscribeDate` (ISO 8601, nullable)
2. GSI on `status` for efficient querying of active subscribers
3. GSI on `subscriberId` for lookup by ID
4. Point-in-time recovery enabled
5. TTL configured on `confirmationToken` (expires after 48 hours for unconfirmed signups)

**Priority:** Must-have
**Effort:** S
**Dependencies:** None
**Workstream:** WS-4 (CDK Infrastructure)

---

#### P1-F02: Subscribe API Endpoint

**User Story:** As a visitor to FreeReverseColoring.com, I want to enter my email address and optional name to subscribe to weekly designs, so that I receive fresh reverse coloring pages in my inbox every week.

**Acceptance Criteria:**
1. `POST /api/subscribe` accepts `{ email, name?, preferences? }` via API Gateway
2. Lambda validates email format (RFC 5322), rejects disposable email domains
3. If email already exists with `active` status, returns 200 with "already subscribed" message (no error)
4. If email exists with `unsubscribed` status, resets to `pending_confirmation` and sends new confirmation email
5. Creates record in DynamoDB with `status: pending_confirmation` and a unique `confirmationToken`
6. Sends double opt-in confirmation email via SES with confirmation link: `https://freereversecoloring.com/confirm?token={confirmationToken}`
7. Confirmation link triggers `GET /api/confirm?token={token}` which:
   - Validates token exists and has not expired (48 hours)
   - Updates subscriber status to `active`
   - Sets `confirmationDate`
   - Redirects to a "Welcome! You're subscribed" page on the website with sample designs
8. Returns appropriate HTTP status codes: 200 (success), 400 (invalid input), 429 (rate limited), 500 (server error)
9. Rate limiting: max 5 subscribe requests per IP per hour

**Priority:** Must-have
**Effort:** M
**Dependencies:** P1-F01 (Subscriber Table), P1-F04 (SES Setup)
**Workstream:** WS-1 (Email & Subscriber System)

---

#### P1-F03: Unsubscribe API Endpoint

**User Story:** As a subscriber, I want to unsubscribe from emails with one click, so that I stop receiving emails immediately and my preferences are respected (CAN-SPAM / GDPR compliance).

**Acceptance Criteria:**
1. `GET /api/unsubscribe?email={email}&token={unsubscribeToken}` via API Gateway
2. Every email includes a unique `unsubscribeToken` per subscriber (stored in DynamoDB) so tokens cannot be guessed
3. Updates subscriber `status` to `unsubscribed`, sets `unsubscribeDate`
4. Redirects to a "Sorry to see you go" page with optional feedback form (reason dropdown: too many emails, not relevant, found alternative, other)
5. If feedback is submitted, stored in a `UnsubscribeFeedback` DynamoDB table
6. All emails include `List-Unsubscribe` and `List-Unsubscribe-Post` headers (RFC 8058) for one-click unsubscribe in email clients
7. Unsubscribe takes effect within 1 minute (no batching delay)

**Priority:** Must-have
**Effort:** S
**Dependencies:** P1-F01 (Subscriber Table), P1-F04 (SES Setup)
**Workstream:** WS-1 (Email & Subscriber System)

---

#### P1-F04: SES Domain Setup & Email Infrastructure

**User Story:** As a product operator, I want production-ready email sending capability on our own domain, so that we can send weekly newsletters and transactional emails without relying on Substack or any third-party email service.

**Acceptance Criteria:**
1. SES verified sending domain: `freereversecoloring.com`
2. DKIM configured (three CNAME records in Route53)
3. SPF record added to DNS (`v=spf1 include:amazonses.com ~all`)
4. DMARC record added (`v=DMARC1; p=quarantine; rua=mailto:dmarc@freereversecoloring.com`)
5. Custom MAIL FROM domain configured: `mail.freereversecoloring.com`
6. SES moved out of sandbox (production access request approved -- requires sending limit increase)
7. SES configuration set with event destinations for: delivery, bounce, complaint, open, click
8. SES event notifications published to SNS topic, consumed by a Lambda that updates subscriber records (bounce -> set `status: bounced`, complaint -> set `status: complained`)
9. Sending identity verified for `hello@freereversecoloring.com` (the From address)
10. Domain warmup plan documented: Week 1 send to max 200, Week 2 to 500, Week 3 to 1000, Week 4+ uncapped

**Priority:** Must-have
**Effort:** M
**Dependencies:** None (CDK + manual AWS console steps for production access)
**Workstream:** WS-1 (Email & Subscriber System) + WS-4 (CDK Infrastructure)

---

#### P1-F05: Double Opt-In Confirmation Email

**User Story:** As a new subscriber, I want to receive a clear, well-designed confirmation email immediately after signing up, so that I can verify my email and start receiving designs.

**Acceptance Criteria:**
1. Email sent within 5 seconds of subscribe API call
2. Subject line: "Confirm your subscription to Free Reverse Coloring"
3. Email body (HTML + plain text fallback):
   - Greeting with name if provided
   - One prominent CTA button: "Confirm My Subscription"
   - Brief description: "You'll receive 3 free reverse coloring designs every Wednesday"
   - Preview of 2-3 sample designs (thumbnail images hosted on our S3/CloudFront)
   - Footer: "If you didn't request this, you can safely ignore this email"
4. CTA links to `https://freereversecoloring.com/confirm?token={confirmationToken}`
5. Email renders correctly in Gmail, Apple Mail, Outlook, and Yahoo Mail (tested with Litmus or manual QA)
6. Confirmation token expires after 48 hours; expired tokens return a "link expired, sign up again" page

**Priority:** Must-have
**Effort:** S
**Dependencies:** P1-F02 (Subscribe API), P1-F04 (SES Setup)
**Workstream:** WS-1 (Email & Subscriber System)

---

#### P1-F06: Weekly Newsletter Email Template & Send Pipeline

**User Story:** As an active subscriber, I want to receive a beautifully designed email every Wednesday with this week's 3 reverse coloring designs, so that I have fresh creative content to print and draw on.

**Acceptance Criteria:**
1. Email template (HTML + plain text):
   - Subject line dynamically generated from theme (e.g., "Ocean Dreams -- 3 new designs to draw your way through")
   - One-line greeting: "This week's designs are inspired by [theme]."
   - Three design cards, each with: thumbnail image (hosted on CloudFront), design title, theme tag, "Print & Draw" CTA button linking to design page
   - Footer: unsubscribe link, preferences link, social media links (Pinterest), contact email
   - `List-Unsubscribe` header included
2. Send Lambda:
   - Triggered by EventBridge rule: every Wednesday at 10:00 AM ET
   - Queries DynamoDB for all subscribers with `status: active`
   - Batch sends via SES `SendBulkTemplatedEmail` (max 50 per API call, with throttling to respect SES rate limits)
   - Logs send results: success count, bounce count, error count
   - Updates `lastEmailSentDate` on each subscriber record
3. Send completes within 30 minutes for up to 10,000 subscribers
4. Failed sends are retried once with exponential backoff; permanent failures logged to CloudWatch

**Priority:** Must-have
**Effort:** L
**Dependencies:** P1-F01 (Subscriber Table), P1-F04 (SES Setup), P1-F08 (Content Pipeline), P1-F09 (Designs DynamoDB Table)
**Workstream:** WS-1 (Email & Subscriber System)

---

#### P1-F07: Substack Migration

**User Story:** As a product operator, I want to migrate existing Substack subscribers to our new system, so that we do not lose our existing audience.

**Acceptance Criteria:**
1. Export subscriber list from Substack (CSV)
2. Send a "we're moving" email via Substack with:
   - Explanation of the move
   - Re-opt-in link pointing to `https://freereversecoloring.com/subscribe?source=substack_migration`
   - Assurance that free content continues
3. Re-opted-in subscribers are captured in DynamoDB with `signupSource: substack_migration`
4. After 4 weeks, sunset the Substack publication (set to private, redirect URL)
5. Do NOT import subscribers without re-opt-in (double opt-in compliance, deliverability protection)

**Priority:** Must-have
**Effort:** S
**Dependencies:** P1-F02 (Subscribe API), P1-F04 (SES Setup)
**Workstream:** WS-1 (Email & Subscriber System)

---

#### P1-F08: Automated AI Content Generation Pipeline

**User Story:** As a product operator, I want the AI generation pipeline to run automatically every week on a schedule, producing 3 themed reverse coloring designs without manual intervention, so that content delivery never stalls due to operator availability.

**Acceptance Criteria:**
1. Generation Lambda:
   - Triggered by EventBridge rule: every Monday at 6:00 AM UTC
   - Selects next theme from theme backlog (DynamoDB table: `ThemeBacklog`)
   - Theme variety engine: no theme repeated within 12 weeks, seasonal awareness (autumn themes Sept-Nov, winter Dec-Feb, etc.)
   - Generates 3 painting descriptions via LLM (GPT-4o or equivalent, JSON mode)
   - For each description, generates 1 watercolor image via gpt-image-1 (OpenAI's native image generation model)
   - Model-agnostic: image generation call wrapped in an abstraction layer (`ImageGeneratorInterface`) that can swap between gpt-image-1, Midjourney API, or Stable Diffusion 3 via environment variable
2. Quality validation step:
   - Image resolution: minimum 2048x2048 pixels
   - File size: between 500KB and 10MB (reject artifacts or corrupted outputs)
   - Color distribution check: reject images that are >80% single color (failed generation)
   - If validation fails, retry generation up to 2 times with modified prompt
3. Storage:
   - Images stored in S3 bucket: `s3://frc-content/{year}/{week-number}/{design-id}/original.png`
   - Optimized variants generated: `print.png` (300 DPI, 8.5x11 aspect), `web.webp` (1200px wide, optimized), `thumbnail.webp` (400px wide)
   - Metadata stored in DynamoDB `Designs` table (see P1-F09)
4. Status tracking: each generation run creates a record in `GenerationRuns` DynamoDB table with `runId`, `timestamp`, `status` (running | completed | failed), `designIds`, `errors`
5. On failure, sends alert email to admin (hello@freereversecoloring.com) via SES
6. On success, designs are in `status: draft` awaiting publish (auto-publish on Wednesday, or manual approval if enabled)

**Priority:** Must-have
**Effort:** XL
**Dependencies:** P1-F04 (SES Setup), P1-F09 (Designs Table), P1-F10 (Content S3 Bucket)
**Workstream:** WS-2 (AI Content Pipeline)

---

#### P1-F09: Designs DynamoDB Table & Data Model

**User Story:** As a product operator, I want all generated design metadata stored in a structured database, so that the website can dynamically render the gallery and email pipeline can reference designs.

**Acceptance Criteria:**
1. DynamoDB table `Designs` created via CDK:
   - Partition Key: `designId` (UUID String)
   - Attributes:
     - `title` (String)
     - `description` (String -- painting description used in generation)
     - `theme` (String)
     - `weekNumber` (Number)
     - `year` (Number)
     - `difficulty` (enum: `easy` | `medium` | `advanced` -- default `medium` for Phase 1, expanded in Phase 2)
     - `tags` (String Set -- e.g., "abstract", "nature", "city")
     - `status` (enum: `draft` | `published` | `archived`)
     - `s3KeyPrefix` (String -- e.g., `2026/12/abc-123/`)
     - `imageUrls` (Map: `{ original, print, web, thumbnail }` -- full CloudFront URLs)
     - `colorPalette` (List of hex strings -- dominant colors extracted during generation)
     - `generationRunId` (String -- reference to GenerationRuns table)
     - `publishDate` (ISO 8601, nullable)
     - `createdAt` (ISO 8601)
     - `downloadCount` (Number, default 0)
     - `printCount` (Number, default 0)
     - `promptUsed` (String -- the exact prompt sent to the image generation API)
   - GSI: `status-publishDate-index` (PK: `status`, SK: `publishDate`) for querying published designs sorted by date
   - GSI: `theme-index` (PK: `theme`) for filtering by theme
2. All existing generated content (6 designs on current site + ~40 images in `ReverseColoringAppAI/images/`) backfilled into this table during initial migration

**Priority:** Must-have
**Effort:** S
**Dependencies:** None
**Workstream:** WS-4 (CDK Infrastructure)

---

#### P1-F10: Content S3 Bucket & CloudFront

**User Story:** As a website visitor, I want design images to load fast from a CDN, so that I can browse and download designs without waiting.

**Acceptance Criteria:**
1. Separate S3 bucket `frc-content-{account-id}` for generated content (distinct from the website bucket)
2. CloudFront distribution serving content bucket with:
   - Cache TTL: 7 days for images (immutable content)
   - CORS headers allowing `freereversecoloring.com` origin
   - Custom domain: `content.freereversecoloring.com`
3. S3 key structure: `{year}/{week-number}/{designId}/{variant}.{ext}`
   - Variants: `original.png`, `print.png`, `web.webp`, `thumbnail.webp`
4. Bucket policy: private by default, CloudFront OAI for read access
5. Lifecycle rule: transition `original.png` to S3 Infrequent Access after 90 days (cost optimization)

**Priority:** Must-have
**Effort:** M
**Dependencies:** None
**Workstream:** WS-4 (CDK Infrastructure)

---

#### P1-F11: Admin Review & Publish Flow

**User Story:** As a product operator, I want to review generated designs before they are published, so that I can catch quality issues and maintain creative standards.

**Acceptance Criteria:**
1. After generation completes (Monday), admin receives email with:
   - 3 design thumbnails
   - Link to approve/reject each design individually
   - "Approve All & Publish Wednesday" button
2. Approval API endpoint: `POST /api/admin/designs/{designId}/publish`
   - Requires admin API key (simple shared secret in Lambda environment variable for Phase 1; proper auth in Phase 2+)
   - Updates design `status` from `draft` to `published`, sets `publishDate` to upcoming Wednesday
3. If no action taken by Tuesday 11:59 PM ET, auto-publish all draft designs (configurable via environment variable `AUTO_PUBLISH_ENABLED=true|false`)
4. Admin can reject a design: `POST /api/admin/designs/{designId}/reject` -- triggers regeneration of a replacement

**Priority:** Should-have
**Effort:** M
**Dependencies:** P1-F08 (Content Pipeline), P1-F09 (Designs Table)
**Workstream:** WS-2 (AI Content Pipeline)

---

#### P1-F12: Domain Consolidation

**User Story:** As a product operator, I want all traffic directed to a single canonical domain, so that SEO value is concentrated and users have a consistent experience.

**Acceptance Criteria:**
1. `freereversecoloringpages.com` permanently redirects (301) to `freereversecoloring.com`
2. `www.freereversecoloring.com` already resolves (CNAME record exists in current CDK stack)
3. Single Google Analytics 4 property (`G-ERGD1FQ73M`) used across the consolidated domain
4. Canonical URLs set on all pages: `<link rel="canonical" href="https://freereversecoloring.com/...">`

**Priority:** Must-have
**Effort:** S
**Dependencies:** None
**Workstream:** WS-4 (CDK Infrastructure)

---

#### P1-F13: Website Rebuild -- Homepage

**User Story:** As a visitor landing on FreeReverseColoring.com for the first time, I want to immediately understand what reverse coloring is, see beautiful example designs, and sign up for free weekly designs with minimal friction, so that I convert from visitor to subscriber.

**Acceptance Criteria:**
1. Next.js application (static export to S3 or ISR via Lambda@Edge)
2. Homepage sections (top to bottom):
   - **Hero:** Full-width featured design image as background with overlay text: "The Colors Are Set -- Your Lines Await." + prominent CTA: "Get Free Weekly Designs" (opens signup form)
   - **This Week's Collection:** 3 design cards (thumbnail, title, theme tag, difficulty badge, "Print & Draw" button)
   - **How It Works:** 3-step visual: (1) Print the watercolor page, (2) Add your own lines & details, (3) Share your creation
   - **Social Proof:** Subscriber count (dynamic from DynamoDB), "Join X creators getting weekly designs"
   - **Gallery Preview:** 6-9 most recent designs in a masonry grid, "See All Designs" link
   - **Signup Form:** Inline email + optional name + theme preference checkboxes + submit button (calls P1-F02 Subscribe API)
   - **FAQ Section:** Migrated from current site (What is Reverse Coloring?, How Do I Start?, etc.)
3. Page load time: under 2 seconds on mobile (3G connection, Lighthouse score > 90)
4. Fully responsive: desktop, tablet, portrait mobile
5. Design language: clean, image-forward, generous whitespace, watercolor-inspired accent colors

**Priority:** Must-have
**Effort:** L
**Dependencies:** P1-F02 (Subscribe API), P1-F09 (Designs Table)
**Workstream:** WS-3 (Website Rebuild)

---

#### P1-F14: Website Rebuild -- Gallery Page

**User Story:** As a visitor or subscriber, I want to browse all published reverse coloring designs in a filterable gallery, so that I can find designs I want to print and draw on.

**Acceptance Criteria:**
1. Route: `/gallery`
2. Masonry or grid layout of all published designs
3. Filter controls:
   - By theme (dropdown or tag chips)
   - By date (newest first, oldest first)
   - [Phase 2] By difficulty level, By color palette
4. Pagination: infinite scroll or "Load More" (20 designs per page)
5. Each card shows: thumbnail, title, theme tag, download count
6. Click-through to individual design page (P1-F15)
7. Data source: API endpoint `GET /api/designs?status=published&sort=publishDate&order=desc&limit=20&offset=0`
8. Empty state (before many designs exist): "More designs coming every Wednesday! Sign up to get them first."

**Priority:** Must-have
**Effort:** M
**Dependencies:** P1-F09 (Designs Table), P1-F18 (Designs API)
**Workstream:** WS-3 (Website Rebuild)

---

#### P1-F15: Website Rebuild -- Individual Design Page

**User Story:** As a visitor, I want a dedicated page for each design where I can view it large, download it in print-ready resolution, and get drawing prompt suggestions, so that I have everything I need to start creating.

**Acceptance Criteria:**
1. Route: `/designs/{designId}` (also `/designs/{designId}/{slug}` for SEO-friendly URL)
2. Page content:
   - Large image (web-optimized, click to view full resolution)
   - Design title and theme
   - Description paragraph
   - **Print button:** Opens browser print dialog with print-optimized image
   - **Download button:** Downloads `print.png` (300 DPI, 8.5x11)
   - Drawing prompt suggestions (3 suggestions, statically generated during content pipeline): "Try drawing ocean creatures", "Add geometric patterns", etc.
   - Tags / theme badges
   - "Next / Previous" navigation to adjacent designs
   - Related designs section (3 designs from same theme)
3. SEO:
   - Unique `<title>`: "{Design Title} - Free Reverse Coloring Page"
   - Meta description from design description
   - Open Graph image (web thumbnail)
   - JSON-LD structured data (`ImageObject` schema)
4. Download and print actions fire GA4 events: `design_download` and `design_print` with `designId` and `theme` parameters
5. Download and print counts increment atomically in DynamoDB (via API call)

**Priority:** Must-have
**Effort:** M
**Dependencies:** P1-F09 (Designs Table), P1-F18 (Designs API)
**Workstream:** WS-3 (Website Rebuild)

---

#### P1-F16: Website Rebuild -- About Page

**User Story:** As a visitor, I want to learn about what reverse coloring is and why this site exists, so that I understand the value and build trust before subscribing.

**Acceptance Criteria:**
1. Route: `/about`
2. Content:
   - "What is Reverse Coloring?" explanation (migrated and expanded from current FAQ)
   - "Why AI-Generated Designs?" -- honest explanation of the AI generation process and its advantages (infinite variety, weekly freshness)
   - "How It Works" visual guide
   - "The Story" -- brief origin story
   - "Best Pens for Reverse Coloring" section (migrated from current FAQ, with affiliate links in Phase 3)
3. SEO-optimized for long-tail keywords: "what is reverse coloring", "reverse coloring for beginners"

**Priority:** Should-have
**Effort:** S
**Dependencies:** None
**Workstream:** WS-3 (Website Rebuild)

---

#### P1-F17: Website Rebuild -- SEO Foundation

**User Story:** As a product operator, I want the website to be well-optimized for search engines from day one, so that organic search becomes the primary subscriber acquisition channel.

**Acceptance Criteria:**
1. Sitemap.xml generated at build time (or dynamically), including all design pages
2. robots.txt allowing full crawl
3. Every page has:
   - Unique `<title>` tag (under 60 characters)
   - Meta description (under 160 characters)
   - Canonical URL
   - Open Graph tags (og:title, og:description, og:image, og:url)
   - Twitter Card tags
4. Image alt text on every design image (generated from design title + description)
5. JSON-LD structured data on homepage (`WebSite` + `Organization`) and design pages (`ImageObject`)
6. Internal linking: design pages link to related designs, gallery, and signup
7. Performance: Lighthouse SEO score > 95
8. Target primary keywords: "reverse coloring pages", "free reverse coloring", "reverse coloring book printable", "adult coloring mindfulness"

**Priority:** Must-have
**Effort:** M
**Dependencies:** P1-F13, P1-F14, P1-F15 (Website pages)
**Workstream:** WS-3 (Website Rebuild)

---

#### P1-F18: Designs Public API

**User Story:** As the website frontend, I need a public API to fetch published design data, so that I can render the gallery and design pages dynamically.

**Acceptance Criteria:**
1. `GET /api/designs` -- list published designs
   - Query params: `status` (default: `published`), `theme`, `sort` (`publishDate` | `downloadCount`), `order` (`asc` | `desc`), `limit` (default 20, max 100), `offset`
   - Response: `{ designs: [...], total: N, hasMore: boolean }`
2. `GET /api/designs/{designId}` -- single design detail
   - Response: full design object including all image URLs and drawing prompts
   - Returns 404 if design not found or not published
3. `POST /api/designs/{designId}/track` -- increment download or print count
   - Body: `{ action: "download" | "print" }`
   - Atomic increment on DynamoDB counter
   - Returns 204 No Content
4. All endpoints return JSON with CORS headers for `freereversecoloring.com`
5. No authentication required for read endpoints
6. Rate limiting: 100 requests/minute per IP

**Priority:** Must-have
**Effort:** M
**Dependencies:** P1-F09 (Designs Table)
**Workstream:** WS-4 (CDK Infrastructure)

---

#### P1-F19: Analytics & Measurement Setup

**User Story:** As a product operator, I want to track key metrics (signups, downloads, prints, email opens, clicks), so that I can measure Phase 1 success and make data-driven decisions.

**Acceptance Criteria:**
1. GA4 property retained (`G-ERGD1FQ73M`), integrated in new Next.js site
2. Custom GA4 events:
   - `signup_started` (form opened/focused)
   - `signup_completed` (API returns 200)
   - `signup_confirmed` (confirmation link clicked)
   - `design_download` (with `designId`, `theme`)
   - `design_print` (with `designId`, `theme`)
   - `gallery_view` (with filter params)
   - `email_cta_click` (with `designId`, `source: email`)
3. SES tracking: opens, clicks, bounces, complaints stored in DynamoDB `EmailEvents` table
4. Weekly metrics summary Lambda:
   - Triggered by EventBridge: every Monday at 8 AM ET
   - Calculates: total subscribers, new subscribers this week, email open rate, click rate, top design by downloads, total downloads
   - Sends summary email to admin

**Priority:** Should-have
**Effort:** M
**Dependencies:** P1-F01 (Subscriber Table), P1-F04 (SES Setup)
**Workstream:** WS-1 (Email & Subscriber System)

---

#### P1-F20: Email Deliverability Monitoring

**User Story:** As a product operator, I want automated monitoring of email deliverability metrics, so that I can detect and fix deliverability issues before they damage our sender reputation.

**Acceptance Criteria:**
1. SES bounce notifications processed by Lambda:
   - Hard bounce: immediately set subscriber status to `bounced`, never email again
   - Soft bounce: increment `bounceCount`, set status to `bounced` after 3 soft bounces
2. SES complaint notifications processed by Lambda:
   - Immediately set subscriber status to `complained`, never email again
3. CloudWatch alarms:
   - Bounce rate > 2%: alarm (immediate investigation)
   - Complaint rate > 0.1%: alarm (critical -- SES will suspend sending)
   - Delivery rate < 95%: alarm
4. Suppression list: SES account-level suppression list enabled for bounces and complaints
5. Re-engagement rule: subscribers who have not opened any email in 90 days are moved to `inactive` segment and receive a re-engagement email before being unsubscribed automatically

**Priority:** Must-have
**Effort:** M
**Dependencies:** P1-F04 (SES Setup), P1-F01 (Subscriber Table)
**Workstream:** WS-1 (Email & Subscriber System)

---

### Phase 2: Grow & Engage (Months 4-6)

**Theme:** "Build the habit, build the community."

**Success Criteria:**
- Subscriber growth rate 15-20% MoM (organic + referral)
- At least 50 user-submitted creations in the gallery
- Email open rate above 40%, click rate above 10%
- Clear data on which themes, styles, and difficulty levels perform best
- Target: 2,000 email subscribers by end of Phase 2

---

#### P2-F01: User Accounts (Lightweight)

**User Story:** As a subscriber, I want to create a simple account using my email, so that I can upload my creations and manage my preferences.

**Acceptance Criteria:**
1. Account creation via "magic link" authentication (no password):
   - User enters email, receives a login link (valid 15 minutes)
   - Clicking link sets a session cookie (HTTP-only, Secure, SameSite=Strict, 30-day expiry)
2. Account stored in `Users` DynamoDB table:
   - PK: `userId` (UUID)
   - Attributes: `email`, `displayName` (optional), `createdAt`, `subscriberId` (link to Subscribers table), `galleryUploads` (Number), `referralCode` (unique 8-char alphanumeric)
   - GSI on `email` for lookup
3. Account linked to existing subscriber record via email
4. No password, no OAuth, no social login in Phase 2 (minimal friction)
5. Logged-in state indicated by avatar/initial icon in navbar; dropdown: "My Uploads", "Preferences", "Sign Out"

**Priority:** Must-have (blocks gallery uploads, referrals)
**Effort:** M
**Dependencies:** P1-F01 (Subscriber Table)
**Workstream:** WS-6 (Community & Engagement)

---

#### P2-F02: Community Gallery -- User Upload

**User Story:** As a logged-in user, I want to upload a photo of my completed reverse coloring page and tag which design I used, so that I can share my creation with the community.

**Acceptance Criteria:**
1. Upload flow:
   - User selects a published design from dropdown ("Which design did you draw on?")
   - User uploads photo (JPEG, PNG, HEIC; max 10MB)
   - Optional caption (max 200 characters)
   - Preview before submit
2. Upload processing:
   - Lambda receives image via API Gateway (binary media type support)
   - Resize to web-optimized variants: `gallery.webp` (800px wide), `thumbnail.webp` (300px wide)
   - Store originals in S3: `s3://frc-gallery/{userId}/{uploadId}/original.{ext}`
   - Store metadata in `GalleryUploads` DynamoDB table:
     - PK: `uploadId` (UUID)
     - Attributes: `userId`, `designId`, `caption`, `imageUrls` (Map), `status` (pending_review | approved | rejected), `hearts` (Number), `createdAt`
3. Basic content moderation:
   - New uploads are `pending_review` (manual approval via admin endpoint for Phase 2)
   - Admin endpoint: `POST /api/admin/gallery/{uploadId}/approve` and `/reject`
   - [Phase 3+] Automated moderation via AWS Rekognition
4. Upload limit: 5 uploads per user per week

**Priority:** Must-have
**Effort:** L
**Dependencies:** P2-F01 (User Accounts), P1-F09 (Designs Table)
**Workstream:** WS-6 (Community & Engagement)

---

#### P2-F03: Community Gallery -- Browse & Vote

**User Story:** As a visitor, I want to browse user-submitted creations on each design's page and heart my favorites, so that I can be inspired and appreciate others' work.

**Acceptance Criteria:**
1. Design page (P1-F15) extended with "Community Creations" section below the drawing prompts:
   - Grid of approved gallery uploads for this design
   - Each card: thumbnail, creator name (or "Anonymous"), heart count, caption
   - "See All" link to full gallery view filtered by this design
2. Gallery page (`/gallery/community`):
   - All approved uploads, newest first
   - Filter by: design used, most hearted, newest
3. Heart/favorite system:
   - Logged-in users can heart an upload (toggle on/off)
   - Hearts stored in `GalleryHearts` DynamoDB table (PK: `userId#uploadId` to prevent duplicates)
   - Atomic increment/decrement on `hearts` counter in `GalleryUploads`
   - Non-logged-in users see heart counts but cannot vote (prompt to create account)
4. No comments in Phase 2 (hearts only -- keep it simple)

**Priority:** Should-have
**Effort:** M
**Dependencies:** P2-F02 (Gallery Upload)
**Workstream:** WS-6 (Community & Engagement)

---

#### P2-F04: Social Sharing Optimization

**User Story:** As a user, I want to easily share designs on Pinterest, Instagram, and Facebook, so that I can show my friends and drive organic growth for the platform.

**Acceptance Criteria:**
1. Every design page has share buttons: Pinterest, Facebook, X/Twitter, "Copy Link"
2. Pinterest pin: vertical 2:3 image (auto-generated variant during content pipeline) with text overlay: design title + "FreeReverseColoring.com"
3. Open Graph / Twitter Card tags customized per design page (image, title, description)
4. Instagram story template: "Before (watercolor) -> After (with lines)" side-by-side -- downloadable PNG optimized for Instagram story dimensions (1080x1920)
5. Share tracking: GA4 event `design_share` with `designId`, `platform`
6. Community uploads have share buttons too (share your creation)

**Priority:** Should-have
**Effort:** M
**Dependencies:** P1-F15 (Design Page)
**Workstream:** WS-3 (Website Rebuild)

---

#### P2-F05: Referral Program

**User Story:** As a subscriber, I want to share a unique referral link with friends, so that when they sign up, both of us receive a bonus design pack (3 exclusive designs).

**Acceptance Criteria:**
1. Every user has a unique referral code (8-char alphanumeric) stored in Users table
2. Referral link: `https://freereversecoloring.com/?ref={referralCode}`
3. When a new subscriber signs up via referral link:
   - `signupSource` set to `referral:{referringUserId}`
   - After the referred user confirms (double opt-in), both referrer and referee receive:
     - Email with 3 exclusive "referral bonus" designs (not in public gallery)
     - Designs served as high-res download links
4. Referral tracking in `Referrals` DynamoDB table: `referrerId`, `referredEmail`, `status` (pending | confirmed | rewarded), `createdAt`
5. Referral dashboard on user profile: "You've referred X friends"
6. Rate limit: max 10 referral rewards per user per month (abuse prevention)

**Priority:** Should-have
**Effort:** M
**Dependencies:** P2-F01 (User Accounts), P1-F02 (Subscribe API)
**Workstream:** WS-6 (Community & Engagement)

---

#### P2-F06: Style Preferences & Personalization

**User Story:** As a subscriber, I want to tell the system which design styles I prefer (e.g., Nature, Abstract, Cityscapes), so that my weekly email is tailored to my tastes.

**Acceptance Criteria:**
1. Preferences collected at two points:
   - During signup (checkboxes on subscribe form): "What styles interest you?" -- Abstract, Nature, Cityscapes, Underwater, Space, Floral, Geometric, Surprise Me
   - On preferences page (`/preferences?email={email}&token={prefsToken}`) linked from every email footer
2. Preferences stored in Subscribers table `preferences` attribute
3. Email send pipeline uses preferences to select designs:
   - If subscriber has preferences: at least 2 of 3 designs match preferred themes
   - "Surprise Me" or no preferences set: random selection from this week's designs
   - If fewer than 2 matching designs exist this week, backfill with recent high-performing designs from preferred themes
4. Generation pipeline considers aggregate preferences:
   - Monthly analysis: "60% of subscribers prefer Nature, 40% prefer Abstract" -- weight future theme selection accordingly
5. Preferences API: `PUT /api/subscribers/{subscriberId}/preferences` -- updates preferences

**Priority:** Should-have
**Effort:** M
**Dependencies:** P1-F01 (Subscriber Table), P1-F08 (Content Pipeline)
**Workstream:** WS-2 (AI Content Pipeline) + WS-1 (Email & Subscriber System)

---

#### P2-F07: Difficulty Levels

**User Story:** As a user, I want designs labeled by difficulty (Easy, Medium, Advanced), so that I can start with simpler designs as a beginner and progress to more complex ones.

**Acceptance Criteria:**
1. Every design tagged with difficulty level:
   - **Easy:** large color blocks, simple gradients, obvious shapes to trace
   - **Medium:** moderate detail, mixed color areas, some ambiguity
   - **Advanced:** complex watercolor washes, subtle color transitions, demands creative interpretation
2. Difficulty determined during generation:
   - LLM assigns difficulty when generating painting description
   - Stored in Designs table `difficulty` field
3. Gallery page: difficulty filter (checkbox or tabs)
4. Design page: difficulty badge displayed prominently
5. New subscriber onboarding: first 4 weeks of emails prioritize "Easy" designs, then gradually introduce Medium and Advanced
6. Subscriber preference: "Preferred difficulty" added to preferences (default: "All")

**Priority:** Should-have
**Effort:** M
**Dependencies:** P1-F08 (Content Pipeline), P1-F09 (Designs Table)
**Workstream:** WS-2 (AI Content Pipeline)

---

#### P2-F08: Printability Options (Multiple Sizes)

**User Story:** As a user, I want to download designs in my preferred paper size (Letter, A4, half-letter), so that I can print on whatever paper I have.

**Acceptance Criteria:**
1. Content pipeline generates print variants for each design:
   - Letter (8.5 x 11 inches, 300 DPI) -- default
   - A4 (210 x 297mm, 300 DPI)
   - Half-letter (5.5 x 8.5 inches, 300 DPI)
2. Design page download button becomes a dropdown: "Download: Letter | A4 | Half-Letter"
3. S3 key structure expanded: `{year}/{week}/{designId}/print-letter.png`, `print-a4.png`, `print-half.png`
4. User preference for default size (stored in subscriber preferences)

**Priority:** Nice-to-have
**Effort:** M
**Dependencies:** P1-F08 (Content Pipeline)
**Workstream:** WS-2 (AI Content Pipeline)

---

#### P2-F09: Weekly Challenges

**User Story:** As a subscriber, I want a weekly creative challenge (e.g., "Draw a cityscape on this abstract background"), so that I have directed inspiration and a reason to engage with the community.

**Acceptance Criteria:**
1. Weekly challenge defined during content generation:
   - LLM generates a challenge prompt based on this week's theme
   - Stored in `Challenges` DynamoDB table: `challengeId`, `weekNumber`, `year`, `designId` (featured design), `prompt`, `publishDate`
2. Challenge featured in:
   - Wednesday email (dedicated section below the 3 designs)
   - Homepage "This Week's Challenge" card
   - Design page of the featured design
3. Gallery uploads can be tagged as "challenge submission" (checkbox during upload)
4. Challenge submissions displayed in a dedicated section on the challenge page
5. Best submission from previous week featured in next week's email (manual selection by admin in Phase 2; community voting in Phase 3)

**Priority:** Should-have
**Effort:** M
**Dependencies:** P2-F02 (Gallery Upload), P1-F08 (Content Pipeline)
**Workstream:** WS-6 (Community & Engagement)

---

#### P2-F10: Email A/B Testing & Segmentation

**User Story:** As a product operator, I want to A/B test email subject lines and segment subscribers by engagement level, so that I can optimize open rates and re-engage lapsing users.

**Acceptance Criteria:**
1. A/B testing for subject lines:
   - Send Lambda splits active subscribers into A/B groups (50/50 by default, configurable)
   - Two subject line variants generated during content pipeline
   - After 4 hours, declare winner based on open rate; log results
2. Engagement segmentation:
   - `highly_engaged`: opened 3+ of last 4 emails
   - `engaged`: opened 1-2 of last 4 emails
   - `lapsing`: opened 0 of last 4 emails
   - `dormant`: opened 0 of last 8 emails
3. Segmented content strategy:
   - `highly_engaged`: richer content (challenge prompt, community highlight, extra design preview)
   - `lapsing`: re-engagement subject line ("We miss you -- here's something special")
   - `dormant`: final re-engagement email, then auto-unsubscribe after 90 days with no opens
4. Segment stored as computed field on subscriber record, recalculated weekly

**Priority:** Should-have
**Effort:** L
**Dependencies:** P1-F06 (Email Send Pipeline), P1-F19 (Analytics)
**Workstream:** WS-1 (Email & Subscriber System)

---

### Phase 3: Monetize (Months 7-9)

**Theme:** "Turn love into revenue."

**Success Criteria:**
- Premium conversion rate 3-5% of active subscribers
- MRR target: $2,000-5,000 by end of Month 9
- At least 3 digital product packs generating passive revenue
- Affiliate revenue covering AI generation costs ($200-500/month)

---

#### P3-F01: Stripe Integration & Payment Infrastructure

**User Story:** As a product operator, I want Stripe integrated as the payment provider, so that I can accept subscription payments and one-time purchases.

**Acceptance Criteria:**
1. Stripe account configured with:
   - Products: "Creator Premium Monthly" ($6.99/mo), "Creator Premium Annual" ($59.99/yr), "Founding Member Monthly" ($4.99/mo), "Founding Member Annual" ($39.99/yr)
   - Webhook endpoint: `POST /api/webhooks/stripe` (Lambda behind API Gateway)
2. Stripe webhook Lambda handles events:
   - `checkout.session.completed`: create/update payment record, upgrade subscriber tier
   - `customer.subscription.updated`: handle plan changes
   - `customer.subscription.deleted`: downgrade to free tier
   - `invoice.payment_failed`: set subscriber status to `payment_failed`, send dunning email
   - `invoice.paid`: clear payment failure status
3. Webhook signature verification (Stripe webhook secret)
4. `Payments` DynamoDB table:
   - PK: `paymentId` (UUID)
   - Attributes: `userId`, `stripeCustomerId`, `stripeSubscriptionId`, `plan` (free | creator_monthly | creator_annual | founding_monthly | founding_annual), `status` (active | past_due | cancelled), `currentPeriodStart`, `currentPeriodEnd`, `createdAt`
   - GSI on `userId`
   - GSI on `stripeCustomerId`
5. Grace period: 7 days past due before downgrade (3 dunning emails: day 1, 3, 7)

**Priority:** Must-have
**Effort:** L
**Dependencies:** P2-F01 (User Accounts)
**Workstream:** WS-5 (Monetization & Payments)

---

#### P3-F02: Premium Tier -- "Creator"

**User Story:** As a free user who loves the product, I want to upgrade to a premium tier for more designs, higher resolution, exclusive styles, and commercial use rights, so that I get an even richer creative experience.

**Acceptance Criteria:**
1. Free tier (unchanged):
   - 3 designs per week via email
   - Full gallery access
   - Standard resolution downloads (150 DPI / web-optimized)
   - Community gallery access
2. Creator tier ($6.99/month or $59.99/year):
   - 10+ designs per week (all difficulty levels) via email and gallery
   - High-resolution downloads (300 DPI, print-optimized)
   - Exclusive premium-only styles: gold/metallic watercolors, dark backgrounds (for white pen), seasonal specials
   - Style preferences honored in email curation
   - Early access: designs available Friday (free users get them Wednesday)
   - Commercial use license for personal projects (Etsy, craft fairs)
   - No ads (once ads exist on free tier)
3. Founding member pricing (first month after launch):
   - $4.99/month or $39.99/year, locked in permanently
4. Upgrade flow:
   - "Upgrade" button in navbar and on design pages (next to download for premium-only designs)
   - Stripe Checkout session for payment
   - Immediate access upon successful payment
5. Premium-only designs: tagged `premiumOnly: true` in Designs table
   - Free users see thumbnail + blurred overlay + "Upgrade to Download" CTA
   - Premium users see full image and download options
6. Content pipeline generates additional premium designs (7+ per week vs. 3 for free)

**Priority:** Must-have
**Effort:** XL
**Dependencies:** P3-F01 (Stripe), P1-F08 (Content Pipeline), P2-F01 (User Accounts)
**Workstream:** WS-5 (Monetization & Payments) + WS-2 (AI Content Pipeline)

---

#### P3-F03: Digital Product Packs

**User Story:** As a user, I want to purchase themed design collections (e.g., "Ocean Dreams" 20-pack), so that I can get a curated set of designs on a topic I love without subscribing monthly.

**Acceptance Criteria:**
1. Product types:
   - Themed collections: 20 designs, $4.99-9.99
   - Printable coloring books: 30-page PDF with cover, instructions, $12.99-19.99
   - Digital-optimized packs: Procreate/GoodNotes files, layered PSD/PNG, $7.99-14.99
2. Purchase flow:
   - Product listing page: `/shop` and `/shop/{productId}`
   - Stripe Checkout (one-time payment)
   - After payment: email with download links + available in "My Purchases" on profile
3. `Products` DynamoDB table:
   - PK: `productId` (UUID)
   - Attributes: `name`, `description`, `type` (collection | book | digital_pack), `price` (cents), `stripePriceId`, `designIds` (List), `downloadUrl` (S3 presigned URL generated on purchase), `thumbnailUrl`, `status` (active | retired), `createdAt`, `salesCount`
4. `Purchases` DynamoDB table:
   - PK: `purchaseId` (UUID)
   - Attributes: `userId`, `productId`, `stripePaymentIntentId`, `amount`, `status`, `createdAt`
   - GSI on `userId`
5. Download links: S3 presigned URLs, valid for 7 days, regeneratable from profile
6. Initial product catalog (3 packs minimum at launch):
   - "Ocean Dreams Collection" (20 ocean-themed designs)
   - "Four Seasons Pack" (48 designs, 12 per season)
   - "Mindfulness Series" (12 designs with guided prompts)

**Priority:** Must-have
**Effort:** L
**Dependencies:** P3-F01 (Stripe)
**Workstream:** WS-5 (Monetization & Payments)

---

#### P3-F04: Affiliate Revenue Integration

**User Story:** As a visitor reading pen/supply recommendations, I want links that take me directly to the products on Amazon, so that I can easily purchase recommended supplies (and the site earns a commission).

**Acceptance Criteria:**
1. Affiliate content sections on:
   - About page ("Best Pens for Reverse Coloring" section)
   - Dedicated guide page: `/guides/best-pens-for-reverse-coloring`
   - Design pages (contextual: "This design works great with Micron pens" with affiliate link)
2. Amazon Associates affiliate links with proper disclosure:
   - "As an Amazon Associate, we earn from qualifying purchases" disclosure on every page with affiliate links
3. Link tracking: GA4 event `affiliate_click` with `product`, `source_page`
4. Initial products: Micron pens, Faber-Castell Pitt Artist Pens, Sakura Gelly Roll, premium printing paper

**Priority:** Should-have
**Effort:** S
**Dependencies:** P1-F15 (Design Pages), P1-F16 (About Page)
**Workstream:** WS-3 (Website Rebuild)

---

#### P3-F05: Advertising (Light Touch)

**User Story:** As a product operator, I want minimal, non-intrusive advertising on the free gallery pages, so that I can generate additional revenue without degrading the user experience.

**Acceptance Criteria:**
1. Ad placement: single banner ad at the bottom of free gallery pages only
2. No ads on: individual design pages (the creative experience), email content, premium user pages
3. Ad provider: Google AdSense or Mediavine (evaluate based on CPM rates for craft/art niche)
4. Ad-free for premium subscribers (check tier before rendering ad component)
5. Ad container component: lazy-loaded, does not affect page load time or Lighthouse score

**Priority:** Nice-to-have
**Effort:** S
**Dependencies:** P3-F02 (Premium Tier -- to exclude premium users)
**Workstream:** WS-3 (Website Rebuild)

---

### Phase 4: Scale (Months 10-12)

**Theme:** "Expand the canvas."

**Success Criteria:**
- MRR: $8,000-15,000
- At least 2 B2B customers (education or therapy)
- Mobile PWA with 1,000+ home screen installs
- International traffic representing 20%+ of total

---

#### P4-F01: Progressive Web App (PWA)

**User Story:** As a mobile user, I want to add FreeReverseColoring.com to my home screen and get push notifications for new designs, so that I can access designs quickly and never miss a week.

**Acceptance Criteria:**
1. PWA manifest (`manifest.json`):
   - App name, icons, theme color, display: `standalone`
2. Service worker:
   - Cache static assets and recent design pages for offline access
   - Background sync for downloading designs while offline
3. "Add to Home Screen" prompt on 3rd visit (or after first download)
4. Push notifications (via Web Push API + backend Lambda):
   - "New designs are here!" every Wednesday
   - Opt-in at first visit, manageable from preferences
5. Mobile-first gallery: swipeable design cards
6. One-tap download to camera roll
7. Responsive design verified on: iPhone SE (small), iPhone 15 (medium), iPad (tablet), Galaxy S24 (Android)

**Priority:** Must-have
**Effort:** L
**Dependencies:** P1-F13 (Website), P1-F18 (Designs API)
**Workstream:** WS-3 (Website Rebuild)

---

#### P4-F02: In-Browser Drawing Tool (Experimental)

**User Story:** As a digital creative, I want to draw directly on a design in my browser, so that I can create without printing and share my digital creation instantly.

**Acceptance Criteria:**
1. Route: `/draw/{designId}`
2. Canvas-based drawing tool:
   - Design loaded as background image
   - Tools: pen (3 sizes: fine, medium, bold), eraser, undo/redo
   - Color picker (default: black, white, brown -- pen-like colors)
3. Save drawing: stores as PNG in S3 under user's gallery
4. Share directly: download finished image or auto-post to community gallery
5. Touch support for mobile/tablet (finger and Apple Pencil compatible)
6. Performance: tool loads in under 3 seconds, no lag at 60fps drawing on iPad
7. Build vs. buy decision: evaluate Excalidraw (open source) fork vs. custom Canvas API implementation vs. integration with Konva.js

**Priority:** Nice-to-have (experimental -- validate demand first)
**Effort:** XL
**Dependencies:** P2-F01 (User Accounts), P1-F15 (Design Page)
**Workstream:** WS-3 (Website Rebuild) or separate spike

---

#### P4-F03: Education Tier

**User Story:** As an art teacher, I want a classroom subscription with bulk download, theme selection, and a simple dashboard, so that I can use reverse coloring as a regular classroom activity.

**Acceptance Criteria:**
1. Education tier ($19.99/month per classroom):
   - All premium designs
   - Teacher dashboard: `/dashboard/classroom`
   - Assign specific designs to "this week's activity"
   - Bulk download: "Download all 10 designs as ZIP" for printing
   - Difficulty filtering: set classroom default (e.g., "Easy only" for younger students)
   - Curriculum-aligned themes: science (cells, planets), history (landmarks), literature (scene illustration)
2. No student accounts needed (teacher prints and distributes)
3. Billing: Stripe subscription, annual option at $179.99/year
4. Onboarding: guided setup wizard for teachers (select grade level, subjects, preferences)

**Priority:** Should-have
**Effort:** XL
**Dependencies:** P3-F01 (Stripe), P3-F02 (Premium Tier)
**Workstream:** WS-5 (Monetization & Payments)

---

#### P4-F04: Therapy & Wellness Tier

**User Story:** As a therapist, I want to curate sets of calming reverse coloring designs for my clients, so that I can integrate creative mindfulness into therapy sessions.

**Acceptance Criteria:**
1. Therapy tier ($29.99/month per practice):
   - All premium designs
   - Therapist dashboard: `/dashboard/practice`
   - "Mood-based" design selection: calming, energizing, grounding tags on designs
   - Curate custom sets: "Session Pack" -- select 3-5 designs, download as PDF pack with instructions
   - Guided prompts: AI-generated therapeutic drawing prompts ("Draw what comes to mind when you look at these colors")
2. No patient data touches our system (explicit: therapist prints pages, no patient info in our database)
3. Billing: Stripe subscription, annual option at $269.99/year

**Priority:** Should-have
**Effort:** XL
**Dependencies:** P3-F01 (Stripe), P3-F02 (Premium Tier)
**Workstream:** WS-5 (Monetization & Payments)

---

#### P4-F05: Internationalization (i18n)

**User Story:** As a non-English-speaking user, I want to browse the site in my language (Spanish, French, German, Japanese), so that I can engage with reverse coloring content in a language I am comfortable with.

**Acceptance Criteria:**
1. Next.js i18n routing: `/es/`, `/fr/`, `/de/`, `/ja/`
2. Translated strings: navbar, homepage, about, FAQs, UI labels
3. Design titles and descriptions: AI-generated in target language during content pipeline
4. Email templates: translated versions, subscriber preference for language
5. A4 as default paper size for non-US locales
6. Region-specific themes: cherry blossoms (Japan), Mediterranean (France/Spain), Alps (Germany)
7. hreflang tags on all pages for multi-language SEO

**Priority:** Nice-to-have
**Effort:** XL
**Dependencies:** P1-F13 (Website), P1-F08 (Content Pipeline)
**Workstream:** WS-3 (Website Rebuild) + WS-2 (AI Content Pipeline)

---

#### P4-F06: API / White-Label (Research Only)

**User Story:** As a product operator, I want to validate whether other platforms or publishers would pay for access to our AI generation engine, so that I can decide whether to invest in building an API product.

**Acceptance Criteria:**
1. This is a RESEARCH feature, not a build feature
2. Deliverables:
   - 10 outreach conversations with potential partners (coloring book publishers, mindfulness app companies, educational content platforms)
   - Pricing model draft: per-image generation ($X), monthly API access ($Y), white-label bundle ($Z)
   - Decision document: build / not build / defer, with supporting evidence
3. No engineering work unless research validates demand from at least 3 paying prospects

**Priority:** Nice-to-have
**Effort:** S (research effort, not engineering)
**Dependencies:** None
**Workstream:** N/A (founder/product activity)

---

## Part 2: Workstream Decomposition

### WS-1: Email & Subscriber System

**Mission:** Own the subscriber relationship. Build reliable, compliant email delivery that runs every week without human intervention.

**Team Size:** 2 engineers
**Phase Coverage:** Phase 1 (primary), Phase 2 (secondary)

#### Features Covered

| Feature ID | Name | Effort | Phase |
|-----------|------|--------|-------|
| P1-F01 | Subscriber DynamoDB Table | S | 1 |
| P1-F02 | Subscribe API Endpoint | M | 1 |
| P1-F03 | Unsubscribe API Endpoint | S | 1 |
| P1-F05 | Double Opt-In Confirmation Email | S | 1 |
| P1-F06 | Weekly Newsletter Email Template & Send Pipeline | L | 1 |
| P1-F07 | Substack Migration | S | 1 |
| P1-F19 | Analytics & Measurement Setup | M | 1 |
| P1-F20 | Email Deliverability Monitoring | M | 1 |
| P2-F06 | Style Preferences (email personalization half) | M | 2 |
| P2-F10 | Email A/B Testing & Segmentation | L | 2 |

#### Deliverables & "Done" Criteria

**D1.1: Subscriber CRUD & Double Opt-In (Week 1-2)**
- Effort: M
- Done when:
  - `POST /api/subscribe` creates a subscriber record and sends a confirmation email via SES
  - `GET /api/confirm?token=X` activates the subscriber
  - `GET /api/unsubscribe?email=X&token=Y` deactivates the subscriber
  - All three endpoints return correct HTTP status codes and handle edge cases (duplicate email, expired token, already unsubscribed)
  - Integration test: full subscribe -> confirm -> verify active flow passes
  - Load test: 100 concurrent subscribe requests succeed without errors

**D1.2: SES Production Setup & Deliverability Monitoring (Week 2-3)**
- Effort: M
- Done when:
  - SES domain verified with DKIM, SPF, DMARC
  - SES production access approved (out of sandbox)
  - Bounce and complaint Lambdas process SES notifications and update subscriber status
  - CloudWatch alarms configured for bounce rate > 2% and complaint rate > 0.1%
  - Test email sent to Gmail, Yahoo, Outlook all land in inbox (not spam)

**D1.3: Weekly Newsletter Pipeline (Week 3-5)**
- Effort: L
- Done when:
  - EventBridge rule fires every Wednesday at 10 AM ET
  - Lambda queries active subscribers, selects this week's published designs, renders email template, sends via SES batch
  - Send completes for 500 subscribers within 5 minutes
  - Email renders correctly in Gmail, Apple Mail, Outlook (manual QA)
  - Open and click tracking events logged to DynamoDB EmailEvents table
  - Admin receives weekly metrics summary email on Monday

**D1.4: Substack Migration (Week 4-5)**
- Effort: S
- Done when:
  - Migration email sent via Substack with re-opt-in link
  - Re-opted subscribers captured in DynamoDB with `source: substack_migration`
  - Substack publication set to private

**D1.5: Email Personalization & A/B Testing (Phase 2, Weeks 13-18)**
- Effort: L
- Done when:
  - Subscribers can set preferences; email pipeline selects designs matching preferences
  - A/B subject line test runs with 50/50 split and winner declared after 4 hours
  - Engagement segments computed weekly; dormant subscribers auto-unsubscribed after 90 days

#### Interfaces with Other Workstreams

- **Consumes from WS-4:** DynamoDB table definitions, API Gateway endpoints, EventBridge rules, SES CDK resources
- **Consumes from WS-2:** Published design data (design IDs, image URLs, theme) for email content
- **Consumed by WS-3:** Subscribe API called from website signup form

---

### WS-2: AI Content Pipeline

**Mission:** Automate the generation of high-quality reverse coloring designs on a weekly cadence, with quality validation, theme variety, and model-agnostic architecture.

**Team Size:** 2 engineers
**Phase Coverage:** Phase 1 (primary), Phase 2 (secondary)

#### Features Covered

| Feature ID | Name | Effort | Phase |
|-----------|------|--------|-------|
| P1-F08 | Automated AI Content Generation Pipeline | XL | 1 |
| P1-F11 | Admin Review & Publish Flow | M | 1 |
| P2-F06 | Style Preferences (generation weighting half) | M | 2 |
| P2-F07 | Difficulty Levels | M | 2 |
| P2-F08 | Printability Options (Multiple Sizes) | M | 2 |
| P3-F02 | Premium Content Generation (premium-only designs) | L | 3 |

#### Deliverables & "Done" Criteria

**D2.1: Lambda-Based Generation Pipeline (Week 2-5)**
- Effort: XL
- Done when:
  - Generation Lambda deployed and triggered by EventBridge (Monday 6 AM UTC)
  - Lambda: reads theme from ThemeBacklog table, generates 3 descriptions via LLM, generates 3 images via image API
  - Image generation call abstracted behind `ImageGeneratorInterface` with gpt-image-1 as default, swappable via env var
  - Generated images stored in S3 with correct key structure (`{year}/{week}/{designId}/{variant}`)
  - Image variants generated: `original.png`, `print.png` (8.5x11 300DPI), `web.webp` (1200px), `thumbnail.webp` (400px)
  - Metadata written to Designs DynamoDB table
  - GenerationRuns table records each run with status
  - End-to-end test: trigger Lambda manually, verify 3 designs created in DynamoDB with valid S3 images

**D2.2: Quality Validation (Week 4-6)**
- Effort: M
- Done when:
  - Validation step checks: resolution >= 2048x2048, file size 500KB-10MB, color distribution (reject >80% single color)
  - Failed validation triggers retry (up to 2 retries with prompt modification)
  - Validation results logged in GenerationRuns record
  - Test: inject a deliberately bad image URL, verify retry and fallback behavior

**D2.3: Theme Variety Engine (Week 3-5)**
- Effort: M
- Done when:
  - ThemeBacklog DynamoDB table populated with 52 weeks of themes
  - No theme repeats within a 12-week window
  - Seasonal awareness: autumn themes (Sept-Nov), winter (Dec-Feb), spring (Mar-May), summer (Jun-Aug)
  - Theme selection considers subscriber preference data (aggregated) when available (Phase 2)

**D2.4: Admin Review Flow (Week 5-6)**
- Effort: M
- Done when:
  - Monday generation triggers admin preview email with design thumbnails
  - Admin clicks "Approve All" or approves/rejects individually via API endpoints
  - If no action by Tuesday 11:59 PM ET, auto-publish fires (configurable)
  - Rejected designs trigger single replacement generation

**D2.5: Difficulty Levels & Multiple Sizes (Phase 2, Weeks 13-16)**
- Effort: M
- Done when:
  - LLM assigns difficulty (easy/medium/advanced) during description generation
  - Generation pipeline produces print variants for Letter, A4, and Half-Letter sizes
  - Designs table updated with difficulty and additional S3 keys for each size

**D2.6: Premium Content Generation (Phase 3, Weeks 25-28)**
- Effort: L
- Done when:
  - Pipeline generates 7+ additional premium-only designs per week
  - Premium styles: gold/metallic watercolors, dark backgrounds, seasonal specials
  - Designs tagged `premiumOnly: true` in DynamoDB

#### Interfaces with Other Workstreams

- **Consumes from WS-4:** DynamoDB table definitions (Designs, ThemeBacklog, GenerationRuns), S3 content bucket, EventBridge rules, Lambda definitions
- **Consumed by WS-1:** Published design data for email templates
- **Consumed by WS-3:** Design images and metadata for gallery/design pages

---

### WS-3: Website Rebuild

**Mission:** Replace the Mobirise static site with a modern, fast, beautiful Next.js website that serves as gallery, conversion funnel, and community hub.

**Team Size:** 2 engineers (frontend-heavy)
**Phase Coverage:** Phase 1 (primary), Phase 2-4 (ongoing)

#### Features Covered

| Feature ID | Name | Effort | Phase |
|-----------|------|--------|-------|
| P1-F13 | Homepage | L | 1 |
| P1-F14 | Gallery Page | M | 1 |
| P1-F15 | Individual Design Page | M | 1 |
| P1-F16 | About Page | S | 1 |
| P1-F17 | SEO Foundation | M | 1 |
| P2-F04 | Social Sharing Optimization | M | 2 |
| P3-F04 | Affiliate Revenue Integration | S | 3 |
| P3-F05 | Advertising (Light Touch) | S | 3 |
| P4-F01 | Progressive Web App | L | 4 |
| P4-F02 | In-Browser Drawing Tool (Experimental) | XL | 4 |
| P4-F05 | Internationalization | XL | 4 |

#### Deliverables & "Done" Criteria

**D3.1: Next.js Project Setup & Homepage (Week 7-8)**
- Effort: L
- Done when:
  - Next.js project initialized with TypeScript, Tailwind CSS, deployed to S3/CloudFront
  - Build pipeline: CodeCommit push -> CodePipeline -> build -> deploy to S3
  - Homepage renders: hero section, featured designs (from Designs API), how-it-works, signup form (calls Subscribe API), FAQ
  - Lighthouse: Performance > 90, SEO > 95, Accessibility > 90
  - Mobile responsive: tested on iPhone SE, iPhone 15, iPad

**D3.2: Gallery & Design Pages (Week 8-10)**
- Effort: M + M
- Done when:
  - `/gallery` page: masonry grid, filter by theme, pagination (Load More, 20 per page)
  - `/designs/{designId}` page: large image, print/download buttons, drawing prompts, related designs, SEO meta tags, JSON-LD structured data
  - Print button opens browser print dialog with optimized image
  - Download button triggers file download (GA4 event tracked)
  - 404 page for non-existent designs

**D3.3: SEO & Analytics Integration (Week 9-10)**
- Effort: M
- Done when:
  - Sitemap.xml generated dynamically (includes all published design pages)
  - robots.txt served
  - All pages have: unique title, meta description, canonical URL, OG tags, Twitter Card tags
  - GA4 integrated with custom events: signup, download, print, gallery_view
  - Schema.org JSON-LD on homepage and design pages

**D3.4: About Page & Content Migration (Week 9-10)**
- Effort: S
- Done when:
  - `/about` page with migrated FAQ content, expanded "What is Reverse Coloring?" guide
  - Internal linking to design pages and signup
  - SEO-optimized for "what is reverse coloring", "reverse coloring for beginners"

**D3.5: Social Sharing & Affiliate Links (Phase 2-3, Weeks 13-28)**
- Effort: M + S
- Done when:
  - Share buttons on design pages: Pinterest, Facebook, X/Twitter, Copy Link
  - Pinterest-optimized image variant served via OG image
  - Affiliate links integrated in about page and guide content with proper disclosure

**D3.6: PWA & Internationalization (Phase 4, Weeks 37-48)**
- Effort: L + XL
- Done when:
  - PWA manifest, service worker, offline caching, "Add to Home Screen" prompt
  - Push notifications for new weekly designs
  - i18n routing for ES, FR, DE, JA with translated UI strings
  - hreflang tags on all pages

#### Interfaces with Other Workstreams

- **Consumes from WS-4:** S3 bucket for static site hosting, CloudFront distribution, API Gateway base URL
- **Consumes from WS-1:** Subscribe/Unsubscribe API endpoints
- **Consumes from WS-2:** Design data via Designs API (images, metadata)
- **Consumes from WS-6:** Gallery upload data, user account state

---

### WS-4: CDK Infrastructure

**Mission:** Expand the existing CDK stack to provision all AWS resources needed across all workstreams. Be the infrastructure backbone that unblocks everyone else.

**Team Size:** 1-2 engineers (can be a shared responsibility with senior engineers from other workstreams)
**Phase Coverage:** Phase 1 (critical path), Phase 2-3 (incremental)

#### Features Covered

| Feature ID | Name | Effort | Phase |
|-----------|------|--------|-------|
| P1-F01 | Subscriber DynamoDB Table | S | 1 |
| P1-F04 | SES Domain Setup (CDK portion) | M | 1 |
| P1-F09 | Designs DynamoDB Table | S | 1 |
| P1-F10 | Content S3 Bucket & CloudFront | M | 1 |
| P1-F12 | Domain Consolidation | S | 1 |
| P1-F18 | Designs Public API | M | 1 |
| All | Lambda definitions, API Gateway, EventBridge rules | L | 1-3 |

#### Deliverables & "Done" Criteria

**D4.1: Foundation Infrastructure (Week 1-2) -- CRITICAL PATH**
- Effort: L
- Done when:
  - DynamoDB tables deployed: `Subscribers`, `Designs`, `ThemeBacklog`, `GenerationRuns`
  - Content S3 bucket (`frc-content`) deployed with CloudFront distribution (`content.freereversecoloring.com`)
  - SES domain identity and configuration set deployed
  - API Gateway REST API deployed with stage `prod`
  - Lambda function shells deployed (subscribe, unsubscribe, confirm, designs-list, designs-get, design-track)
  - EventBridge rules deployed (generation: Monday 6AM UTC, email: Wednesday 10AM ET, metrics: Monday 8AM ET)
  - IAM roles with least-privilege policies for each Lambda
  - All resources in CDK stack, deployable with `cdk deploy`
  - Outputs: API Gateway URL, CloudFront distribution domain, S3 bucket names

**D4.2: Domain & DNS (Week 1)**
- Effort: S
- Done when:
  - `freereversecoloringpages.com` 301 redirect configured (via CloudFront function or S3 redirect)
  - `content.freereversecoloring.com` CNAME record pointing to content CloudFront distribution
  - `mail.freereversecoloring.com` configured as SES MAIL FROM domain

**D4.3: Phase 2 Infrastructure Additions (Weeks 13-14)**
- Effort: M
- Done when:
  - DynamoDB tables deployed: `Users`, `GalleryUploads`, `GalleryHearts`, `Referrals`, `Challenges`, `UnsubscribeFeedback`
  - S3 gallery bucket for user uploads
  - API Gateway endpoints for gallery upload, user auth, referrals
  - Lambda functions for magic link auth, gallery upload processing

**D4.4: Phase 3 Infrastructure Additions (Weeks 25-26)**
- Effort: M
- Done when:
  - DynamoDB tables deployed: `Payments`, `Products`, `Purchases`
  - Stripe webhook Lambda deployed with API Gateway endpoint
  - S3 bucket for digital product files (with presigned URL generation)

#### Interfaces with Other Workstreams

- **Consumed by ALL workstreams:** Every workstream depends on infrastructure being provisioned first
- **WS-4 is the critical-path unblocking workstream for Week 1-2**

---

### WS-5: Monetization & Payments

**Mission:** Build the payment infrastructure and premium experience that converts engaged free users into paying subscribers and digital product buyers.

**Team Size:** 2 engineers
**Phase Coverage:** Phase 3 (primary), Phase 4 (secondary)

#### Features Covered

| Feature ID | Name | Effort | Phase |
|-----------|------|--------|-------|
| P3-F01 | Stripe Integration & Payment Infrastructure | L | 3 |
| P3-F02 | Premium Tier -- "Creator" | XL | 3 |
| P3-F03 | Digital Product Packs | L | 3 |
| P4-F03 | Education Tier | XL | 4 |
| P4-F04 | Therapy & Wellness Tier | XL | 4 |

#### Deliverables & "Done" Criteria

**D5.1: Stripe Integration (Weeks 25-27)**
- Effort: L
- Done when:
  - Stripe products and prices configured (monthly, annual, founding)
  - Webhook Lambda handles all subscription lifecycle events
  - Payments and subscription status tracked in DynamoDB
  - Dunning emails sent on payment failure (day 1, 3, 7)
  - Grace period: 7 days before downgrade
  - Integration test: full Stripe checkout -> webhook -> subscriber upgrade flow in test mode

**D5.2: Premium Tier UX (Weeks 27-30)**
- Effort: XL
- Done when:
  - Upgrade flow: "Upgrade" CTA -> Stripe Checkout -> immediate access
  - Premium-only designs: blurred preview with "Upgrade to Download" for free users
  - Premium users see all designs, get high-res downloads
  - Email pipeline sends 10+ designs to premium subscribers (vs. 3 for free)
  - Early access: premium designs available Friday, free designs Wednesday
  - Founding member pricing live for first month

**D5.3: Digital Products Store (Weeks 30-33)**
- Effort: L
- Done when:
  - `/shop` page listing available product packs
  - `/shop/{productId}` detail page with preview images, description, purchase button
  - Stripe Checkout for one-time purchase
  - Post-purchase: email with download links, "My Purchases" page
  - Presigned S3 URLs for secure downloads (7-day expiry)
  - 3 initial products live and purchasable

**D5.4: B2B Tiers (Phase 4, Weeks 37-45)**
- Effort: XL + XL
- Done when:
  - Education dashboard: assign designs, bulk download ZIP, difficulty filter
  - Therapy dashboard: mood-based selection, session pack creation
  - Stripe subscriptions for education ($19.99/mo) and therapy ($29.99/mo) tiers
  - Onboarding wizards for each tier

#### Interfaces with Other Workstreams

- **Consumes from WS-4:** DynamoDB tables (Payments, Products, Purchases), API Gateway endpoints, Lambda definitions
- **Consumes from WS-2:** Premium-only design content
- **Consumes from WS-6:** User accounts (userId for payment linking)
- **Consumed by WS-3:** Upgrade CTAs, premium content gating, shop pages

---

### WS-6: Community & Engagement

**Mission:** Build the social layer that transforms passive consumers into active creators who share, vote, refer, and participate in challenges.

**Team Size:** 2 engineers
**Phase Coverage:** Phase 2 (primary), Phase 3-4 (supporting)

#### Features Covered

| Feature ID | Name | Effort | Phase |
|-----------|------|--------|-------|
| P2-F01 | User Accounts (Lightweight) | M | 2 |
| P2-F02 | Community Gallery -- User Upload | L | 2 |
| P2-F03 | Community Gallery -- Browse & Vote | M | 2 |
| P2-F05 | Referral Program | M | 2 |
| P2-F09 | Weekly Challenges | M | 2 |

#### Deliverables & "Done" Criteria

**D6.1: Magic Link Authentication (Weeks 13-14)**
- Effort: M
- Done when:
  - "Sign In" button on navbar triggers magic link flow
  - User enters email -> receives login link (valid 15 minutes) -> clicks link -> session cookie set
  - Session cookie: HTTP-only, Secure, SameSite=Strict, 30-day expiry
  - Users DynamoDB table created with unique referral codes
  - Account linked to existing subscriber record via email match
  - Logged-in navbar shows initial/avatar, dropdown: My Uploads, Preferences, Sign Out

**D6.2: Gallery Upload System (Weeks 15-17)**
- Effort: L
- Done when:
  - Upload flow: select design from dropdown, upload photo (JPEG/PNG/HEIC, max 10MB), optional caption, preview, submit
  - Lambda processes upload: resize to gallery (800px) and thumbnail (300px), store in S3
  - GalleryUploads DynamoDB record created with `status: pending_review`
  - Admin approval endpoint works
  - Upload limit enforced: 5 per user per week
  - End-to-end test: upload image -> admin approve -> appears on design page

**D6.3: Gallery Browse & Hearts (Weeks 17-18)**
- Effort: M
- Done when:
  - Design page shows "Community Creations" section with approved uploads
  - `/gallery/community` page with filters (by design, most hearted, newest)
  - Heart toggle: logged-in users can heart/unheart, count displayed
  - GalleryHearts table prevents duplicate votes
  - Non-logged-in users see counts but prompted to sign in to vote

**D6.4: Referral Program (Weeks 18-20)**
- Effort: M
- Done when:
  - Each user has unique referral code in profile
  - Referral link: `/?ref={code}` captured during signup
  - After referred user confirms, both parties receive bonus design email
  - Referrals table tracks status (pending -> confirmed -> rewarded)
  - Profile shows "You've referred X friends"
  - Rate limit: max 10 referral rewards per user per month

**D6.5: Weekly Challenges (Weeks 19-22)**
- Effort: M
- Done when:
  - Challenges table populated during content generation (one per week)
  - Challenge displayed in email, homepage, and featured design page
  - Gallery uploads can be tagged as challenge submissions
  - Previous week's best submission featured (admin-selected in Phase 2)

#### Interfaces with Other Workstreams

- **Consumes from WS-4:** DynamoDB tables (Users, GalleryUploads, GalleryHearts, Referrals, Challenges), S3 gallery bucket, API Gateway, Lambdas
- **Consumes from WS-1:** Subscriber data (link user to subscriber)
- **Consumed by WS-3:** Gallery UI components, user auth state, challenge display
- **Consumed by WS-5:** User accounts for payment linking

---

## Part 3: Dependency Map

### Cross-Workstream Dependencies

```
WS-4 (CDK Infrastructure)
  |
  |--- unblocks ---> WS-1 (Email & Subscriber)     [Week 1-2: tables, SES, API GW]
  |--- unblocks ---> WS-2 (AI Content Pipeline)     [Week 1-2: tables, S3, EventBridge]
  |--- unblocks ---> WS-3 (Website Rebuild)          [Week 2-3: API GW, S3 hosting]
  |--- unblocks ---> WS-6 (Community & Engagement)   [Week 13: Phase 2 tables]
  |--- unblocks ---> WS-5 (Monetization & Payments)  [Week 25: Phase 3 tables]

WS-2 (AI Content Pipeline)
  |--- provides design data to ---> WS-1 (for email content)   [Week 5+]
  |--- provides design data to ---> WS-3 (for gallery/pages)   [Week 7+]

WS-1 (Email & Subscriber)
  |--- provides subscribe API to ---> WS-3 (signup form)       [Week 3+]

WS-6 (Community & Engagement)
  |--- provides user accounts to ---> WS-5 (payment linking)   [Week 25+]
  |--- provides gallery data to ---> WS-3 (UI rendering)       [Week 17+]
```

### Critical Path Through Phase 1

The critical path determines the earliest possible "automated weekly email" milestone:

```
Week 1-2:  WS-4 deploys foundation infrastructure (tables, S3, SES, API GW, EventBridge)
           |
           +---> WS-1 starts building subscribe/unsubscribe APIs (Week 1-2)
           +---> WS-2 starts building generation Lambda (Week 2)
           |
Week 2-3:  WS-1 delivers subscriber CRUD + SES setup (D1.1, D1.2)
           WS-2 delivers generation pipeline MVP (D2.1)
           |
Week 3-5:  WS-1 builds email send pipeline (D1.3)
           WS-2 builds quality validation + theme engine (D2.2, D2.3)
           |
Week 5:    *** MILESTONE: First automated generation run (Monday) ***
Week 5:    *** MILESTONE: First automated email send (Wednesday) ***
           |
Week 4-5:  WS-1 completes Substack migration (D1.4)
           WS-2 builds admin review flow (D2.4)
           |
Week 7-8:  WS-3 starts website rebuild (needs: Designs API from WS-4, Subscribe API from WS-1)
           |
Week 9-10: WS-3 delivers gallery + design pages + SEO
           |
Week 11-12: Polish, monitoring, launch
           *** MILESTONE: Phase 1 Complete ***
```

### Parallelization Opportunities

**Fully parallel from Week 1:**
- WS-4 (infrastructure) and WS-2 (generation Lambda logic -- can develop locally)
- WS-3 (UI/UX design, component library, static mockups -- does not need backend yet)

**Parallel from Week 3:**
- WS-1 (email pipeline) and WS-2 (generation pipeline) -- they share data via DynamoDB but have no code dependencies
- WS-3 (website build) can start once Designs API is deployed (Week 3)

**Sequential dependencies (cannot be parallelized):**
- WS-4 must deploy tables BEFORE WS-1 and WS-2 can deploy their Lambdas
- WS-2 must generate content BEFORE WS-1 can send emails with real designs
- WS-6 (community) cannot start until Phase 2 infrastructure is deployed by WS-4
- WS-5 (payments) cannot start until Phase 3 infrastructure is deployed by WS-4 and WS-6 provides user accounts

### Phase Timeline Summary

```
Month 1    Month 2    Month 3    Month 4    Month 5    Month 6
|----------|----------|----------|----------|----------|----------|
[====WS-4: Foundation Infra====]
   [========WS-1: Email & Subscriber System========]
   [========WS-2: AI Content Pipeline==============]
              [========WS-3: Website Rebuild===========]
                                 [====WS-4: Phase 2 Infra====]
                                    [========WS-6: Community & Engagement========]
                                    [==WS-1: Personalization/Segmentation==]
                                    [==WS-2: Difficulty/Sizes==]

Month 7    Month 8    Month 9    Month 10   Month 11   Month 12
|----------|----------|----------|----------|----------|----------|
[==WS-4: Phase 3 Infra==]
   [========WS-5: Monetization & Payments (Stripe, Premium, Shop)========]
   [==WS-2: Premium Content==]
                                 [========WS-3: PWA, i18n========]
                                    [========WS-5: B2B Tiers========]
```

---

## Part 4: API Contracts

All APIs are served via a single API Gateway REST API at `https://api.freereversecoloring.com/v1/`. CORS allowed origin: `https://freereversecoloring.com`.

### 4.1 Subscribe / Unsubscribe API

**Used by:** WS-3 (website signup form), WS-1 (Lambda implementations)
**Provided by:** WS-1 (Lambda) + WS-4 (API Gateway + DynamoDB)

#### POST /v1/subscribe

Request:
```json
{
  "email": "sarah@example.com",
  "name": "Sarah",
  "preferences": {
    "themes": ["nature", "abstract", "floral"],
    "difficulty": "all"
  },
  "source": "homepage_form",
  "referralCode": "abc12345"
}
```

Response (201 Created):
```json
{
  "success": true,
  "message": "Please check your email to confirm your subscription.",
  "subscriberId": "uuid-string"
}
```

Response (200 OK -- already subscribed):
```json
{
  "success": true,
  "message": "You're already subscribed! Check your email for this week's designs."
}
```

Response (400 Bad Request):
```json
{
  "success": false,
  "error": "INVALID_EMAIL",
  "message": "Please enter a valid email address."
}
```

Response (429 Too Many Requests):
```json
{
  "success": false,
  "error": "RATE_LIMITED",
  "message": "Too many requests. Please try again in a few minutes."
}
```

#### GET /v1/confirm

Query params: `token={confirmationToken}`

Response: 302 Redirect to `https://freereversecoloring.com/welcome` (on success) or `https://freereversecoloring.com/expired` (on expired/invalid token).

#### GET /v1/unsubscribe

Query params: `email={email}&token={unsubscribeToken}`

Response: 302 Redirect to `https://freereversecoloring.com/unsubscribed`.

#### PUT /v1/subscribers/{subscriberId}/preferences

Request:
```json
{
  "themes": ["nature", "underwater", "space"],
  "difficulty": "medium",
  "paperSize": "a4",
  "language": "en"
}
```

Response (200 OK):
```json
{
  "success": true,
  "preferences": {
    "themes": ["nature", "underwater", "space"],
    "difficulty": "medium",
    "paperSize": "a4",
    "language": "en"
  }
}
```

---

### 4.2 Designs API

**Used by:** WS-3 (website gallery, design pages), WS-1 (email template rendering)
**Provided by:** WS-4 (API Gateway + Lambda) reading from WS-2 (generated design data)

#### GET /v1/designs

Query params:
- `status`: `published` (default) | `draft` | `all` (admin only)
- `theme`: filter by theme string (e.g., `ocean_life`)
- `difficulty`: `easy` | `medium` | `advanced`
- `premiumOnly`: `true` | `false`
- `sort`: `publishDate` (default) | `downloadCount` | `hearts`
- `order`: `desc` (default) | `asc`
- `limit`: 1-100 (default 20)
- `offset`: 0+ (default 0)

Response (200 OK):
```json
{
  "designs": [
    {
      "designId": "uuid-string",
      "title": "Whispers of the Deep",
      "description": "An abstract watercolor composition, rich in cool colors...",
      "theme": "ocean_life",
      "weekNumber": 1,
      "year": 2026,
      "difficulty": "medium",
      "tags": ["abstract", "underwater", "blue"],
      "status": "published",
      "premiumOnly": false,
      "imageUrls": {
        "thumbnail": "https://content.freereversecoloring.com/2026/1/abc-123/thumbnail.webp",
        "web": "https://content.freereversecoloring.com/2026/1/abc-123/web.webp",
        "print": "https://content.freereversecoloring.com/2026/1/abc-123/print.png",
        "printA4": "https://content.freereversecoloring.com/2026/1/abc-123/print-a4.png",
        "printHalf": "https://content.freereversecoloring.com/2026/1/abc-123/print-half.png"
      },
      "colorPalette": ["#1a3a5c", "#2e7d8c", "#6b4c9a", "#8fb8d0"],
      "drawingPrompts": [
        "Try drawing ocean creatures swimming through the colors",
        "Add geometric patterns that follow the color flows",
        "Create a landscape with buildings silhouetted against the background"
      ],
      "downloadCount": 142,
      "printCount": 89,
      "publishDate": "2026-04-02T10:00:00Z",
      "createdAt": "2026-03-30T06:00:00Z"
    }
  ],
  "total": 156,
  "limit": 20,
  "offset": 0,
  "hasMore": true
}
```

#### GET /v1/designs/{designId}

Response (200 OK): Single design object (same schema as above).

Response (404 Not Found):
```json
{
  "success": false,
  "error": "DESIGN_NOT_FOUND",
  "message": "Design not found."
}
```

#### POST /v1/designs/{designId}/track

Request:
```json
{
  "action": "download"
}
```

Response: 204 No Content

---

### 4.3 Content Generation Data Model

**Used by:** WS-2 (content pipeline), consumed by WS-1 (email) and WS-3 (website)
**Storage:** DynamoDB + S3

#### ThemeBacklog Table

| Attribute | Type | Description |
|-----------|------|-------------|
| `themeId` (PK) | String (UUID) | Unique identifier |
| `theme` | String | Theme name (e.g., "Ocean Life") |
| `description` | String | Theme description for LLM prompt |
| `season` | String | `spring` | `summer` | `autumn` | `winter` | `all` |
| `status` | String | `queued` | `used` | `retired` |
| `scheduledWeek` | Number | Week number (1-52) |
| `scheduledYear` | Number | Year |
| `lastUsedDate` | String (ISO 8601) | When this theme was last used |
| `timesUsed` | Number | How many times this theme has been used |

#### GenerationRuns Table

| Attribute | Type | Description |
|-----------|------|-------------|
| `runId` (PK) | String (UUID) | Unique identifier |
| `triggerType` | String | `scheduled` | `manual` | `retry` |
| `themeId` | String | Reference to ThemeBacklog |
| `status` | String | `running` | `completed` | `failed` | `partial` |
| `designIds` | List<String> | Design IDs generated in this run |
| `startedAt` | String (ISO 8601) | Run start time |
| `completedAt` | String (ISO 8601) | Run end time |
| `errors` | List<Map> | Error details if any |
| `imageModel` | String | Model used (e.g., `gpt-image-1`, `stable-diffusion-3`) |
| `llmModel` | String | LLM used (e.g., `gpt-4o`) |
| `totalCost` | Number | Estimated cost in cents |

#### S3 Key Structure

```
frc-content/
  {year}/
    {weekNumber}/
      {designId}/
        original.png          # Raw generation output (2048x2048+)
        print-letter.png      # 8.5x11" 300 DPI
        print-a4.png          # A4 300 DPI
        print-half.png        # 5.5x8.5" 300 DPI
        web.webp              # 1200px wide, optimized
        thumbnail.webp        # 400px wide
        pinterest.webp        # 1000x1500 (2:3 ratio) with text overlay
        metadata.json         # Generation metadata (prompt, model, timestamps)

frc-gallery/
  {userId}/
    {uploadId}/
      original.{ext}         # User's uploaded photo
      gallery.webp            # 800px wide
      thumbnail.webp          # 300px wide

frc-products/
  {productId}/
    product-thumbnail.webp
    download/
      {productId}-collection.zip    # Downloadable product file
```

---

### 4.4 Email Send API (Internal)

**Used by:** WS-1 (email pipeline Lambda)
**Not exposed via API Gateway** -- this is an internal contract between the EventBridge trigger and the email send Lambda.

#### Email Send Lambda Input (from EventBridge)

```json
{
  "source": "frc.scheduler",
  "detail-type": "WeeklyEmailSend",
  "detail": {
    "weekNumber": 14,
    "year": 2026,
    "sendDate": "2026-04-02T14:00:00Z"
  }
}
```

#### Email Send Lambda Logic

1. Query Designs table: `status = published AND weekNumber = {weekNumber} AND year = {year}`
2. Query Subscribers table: `status = active` (via scan with filter or GSI)
3. For each batch of 50 subscribers:
   a. Select designs based on subscriber preferences (if P2-F06 implemented) or use all 3 published designs
   b. Render email template with design data
   c. Call `SES.sendBulkTemplatedEmail()` with personalized template data
   d. Log results to EmailEvents table
4. After all batches: calculate and log summary metrics

#### EmailEvents Table

| Attribute | Type | Description |
|-----------|------|-------------|
| `eventId` (PK) | String (UUID) | Unique event identifier |
| `subscriberId` | String | Subscriber reference |
| `email` | String | Recipient email |
| `emailType` | String | `weekly_newsletter` | `confirmation` | `welcome` | `reengagement` | `dunning` |
| `sesMessageId` | String | SES message ID for correlation |
| `status` | String | `sent` | `delivered` | `opened` | `clicked` | `bounced` | `complained` |
| `sentAt` | String (ISO 8601) | When email was sent |
| `eventTimestamp` | String (ISO 8601) | When this status event occurred |
| `metadata` | Map | Additional data (link clicked, bounce type, etc.) |

GSI: `subscriberId-sentAt-index` (PK: `subscriberId`, SK: `sentAt`) for querying email history per subscriber.

---

### 4.5 Payment Webhook API

**Used by:** Stripe (calls our webhook), WS-5 (Lambda implementation)
**Provided by:** WS-4 (API Gateway endpoint), WS-5 (Lambda logic)

#### POST /v1/webhooks/stripe

Request: Raw Stripe webhook payload (JSON). Headers include `Stripe-Signature` for verification.

Lambda logic by event type:

**`checkout.session.completed`:**
```json
{
  "action": "create_or_update_payment",
  "userId": "extracted from metadata",
  "stripeCustomerId": "cus_xxx",
  "stripeSubscriptionId": "sub_xxx",
  "plan": "creator_monthly",
  "status": "active"
}
```
- Create record in Payments table
- Update user's `tier` to `creator` in Users table
- Send welcome-to-premium email

**`customer.subscription.deleted`:**
- Update Payments record: `status: cancelled`
- Update user's `tier` to `free` in Users table
- Send "sorry to see you go" email with feedback form

**`invoice.payment_failed`:**
- Update Payments record: `status: past_due`
- Send dunning email (day 1 of 3-email sequence)
- Schedule follow-up dunning emails (day 3, day 7)

**`invoice.paid`:**
- Clear `past_due` status
- Cancel any pending dunning emails

#### Payment-Related API Endpoints (User-Facing)

**POST /v1/checkout/session** (creates Stripe Checkout session)

Request:
```json
{
  "userId": "uuid-string",
  "plan": "creator_monthly",
  "successUrl": "https://freereversecoloring.com/welcome-premium",
  "cancelUrl": "https://freereversecoloring.com/pricing"
}
```

Response (200 OK):
```json
{
  "sessionId": "cs_xxx",
  "url": "https://checkout.stripe.com/c/pay/cs_xxx"
}
```

**GET /v1/users/{userId}/subscription**

Response (200 OK):
```json
{
  "plan": "creator_monthly",
  "status": "active",
  "currentPeriodEnd": "2026-05-02T00:00:00Z",
  "cancelAtPeriodEnd": false,
  "stripeCustomerPortalUrl": "https://billing.stripe.com/p/session/xxx"
}
```

**POST /v1/users/{userId}/subscription/cancel**

Response (200 OK):
```json
{
  "success": true,
  "message": "Your subscription will end on 2026-05-02. You'll continue to have premium access until then.",
  "cancelAtPeriodEnd": true
}
```

---

### 4.6 Gallery API (Phase 2)

**Used by:** WS-3 (gallery UI), WS-6 (upload processing)
**Provided by:** WS-6 (Lambda logic) + WS-4 (API Gateway)

#### POST /v1/gallery/upload

Headers: `Authorization: Bearer {sessionToken}`

Request: `multipart/form-data`
- `image`: file (JPEG, PNG, HEIC, max 10MB)
- `designId`: string (which design was drawn on)
- `caption`: string (max 200 chars, optional)
- `isChallenge`: boolean (optional, tags as challenge submission)

Response (201 Created):
```json
{
  "success": true,
  "uploadId": "uuid-string",
  "status": "pending_review",
  "message": "Your creation has been submitted for review!"
}
```

#### GET /v1/gallery

Query params:
- `designId`: filter by specific design
- `status`: `approved` (default for public), `pending_review` | `rejected` (admin only)
- `sort`: `newest` (default) | `mostHearted`
- `limit`: 1-50 (default 20)
- `offset`: 0+

Response (200 OK):
```json
{
  "uploads": [
    {
      "uploadId": "uuid-string",
      "userId": "uuid-string",
      "displayName": "Sarah M.",
      "designId": "uuid-string",
      "designTitle": "Whispers of the Deep",
      "caption": "Added some fish and coral!",
      "imageUrls": {
        "gallery": "https://content.freereversecoloring.com/gallery/abc/gallery.webp",
        "thumbnail": "https://content.freereversecoloring.com/gallery/abc/thumbnail.webp"
      },
      "hearts": 12,
      "isChallenge": false,
      "createdAt": "2026-05-15T14:30:00Z"
    }
  ],
  "total": 87,
  "hasMore": true
}
```

#### POST /v1/gallery/{uploadId}/heart

Headers: `Authorization: Bearer {sessionToken}`

Response (200 OK):
```json
{
  "hearted": true,
  "totalHearts": 13
}
```

(Toggle: calling again removes the heart and decrements count.)

---

### 4.7 User Authentication API (Phase 2)

**Used by:** WS-3 (login UI), WS-6 (session management)
**Provided by:** WS-6 (Lambda logic) + WS-4 (API Gateway)

#### POST /v1/auth/magic-link

Request:
```json
{
  "email": "sarah@example.com"
}
```

Response (200 OK):
```json
{
  "success": true,
  "message": "Check your email for a login link."
}
```

(Always returns 200 whether email exists or not -- no email enumeration.)

#### GET /v1/auth/verify

Query params: `token={magicLinkToken}`

Response: Sets `session` HTTP-only cookie and redirects to `https://freereversecoloring.com/`.

#### GET /v1/auth/me

Headers: `Cookie: session={sessionToken}`

Response (200 OK):
```json
{
  "userId": "uuid-string",
  "email": "sarah@example.com",
  "displayName": "Sarah M.",
  "tier": "free",
  "referralCode": "abc12345",
  "galleryUploads": 3,
  "referralCount": 2,
  "createdAt": "2026-04-01T12:00:00Z"
}
```

Response (401 Unauthorized):
```json
{
  "success": false,
  "error": "NOT_AUTHENTICATED"
}
```

#### POST /v1/auth/logout

Clears session cookie. Response: 204 No Content.

---

## Appendix A: DynamoDB Table Summary

| Table | PK | SK | GSIs | Phase | Workstream |
|-------|----|----|------|-------|------------|
| Subscribers | email | -- | status-index, subscriberId-index | 1 | WS-4 |
| Designs | designId | -- | status-publishDate-index, theme-index | 1 | WS-4 |
| ThemeBacklog | themeId | -- | scheduledYear-scheduledWeek-index | 1 | WS-4 |
| GenerationRuns | runId | -- | -- | 1 | WS-4 |
| EmailEvents | eventId | -- | subscriberId-sentAt-index | 1 | WS-4 |
| UnsubscribeFeedback | feedbackId | -- | -- | 1 | WS-4 |
| Users | userId | -- | email-index | 2 | WS-4 |
| GalleryUploads | uploadId | -- | designId-index, userId-index, status-index | 2 | WS-4 |
| GalleryHearts | `userId#uploadId` | -- | -- | 2 | WS-4 |
| Referrals | referralId | -- | referrerId-index | 2 | WS-4 |
| Challenges | challengeId | -- | year-weekNumber-index | 2 | WS-4 |
| Payments | paymentId | -- | userId-index, stripeCustomerId-index | 3 | WS-4 |
| Products | productId | -- | status-index | 3 | WS-4 |
| Purchases | purchaseId | -- | userId-index | 3 | WS-4 |

**Total: 14 tables across 3 phases.**

---

## Appendix B: Lambda Function Summary

| Lambda | Trigger | Phase | Workstream |
|--------|---------|-------|------------|
| subscribe | API Gateway POST /v1/subscribe | 1 | WS-1 |
| confirm | API Gateway GET /v1/confirm | 1 | WS-1 |
| unsubscribe | API Gateway GET /v1/unsubscribe | 1 | WS-1 |
| preferences-update | API Gateway PUT /v1/subscribers/{id}/preferences | 1 | WS-1 |
| email-send | EventBridge (Wed 10AM ET) | 1 | WS-1 |
| email-event-processor | SNS (SES events) | 1 | WS-1 |
| metrics-summary | EventBridge (Mon 8AM ET) | 1 | WS-1 |
| content-generate | EventBridge (Mon 6AM UTC) | 1 | WS-2 |
| content-validate | Invoked by content-generate | 1 | WS-2 |
| admin-publish | API Gateway POST /v1/admin/designs/{id}/publish | 1 | WS-2 |
| designs-list | API Gateway GET /v1/designs | 1 | WS-4 |
| designs-get | API Gateway GET /v1/designs/{id} | 1 | WS-4 |
| design-track | API Gateway POST /v1/designs/{id}/track | 1 | WS-4 |
| magic-link-send | API Gateway POST /v1/auth/magic-link | 2 | WS-6 |
| magic-link-verify | API Gateway GET /v1/auth/verify | 2 | WS-6 |
| auth-me | API Gateway GET /v1/auth/me | 2 | WS-6 |
| gallery-upload | API Gateway POST /v1/gallery/upload | 2 | WS-6 |
| gallery-list | API Gateway GET /v1/gallery | 2 | WS-6 |
| gallery-heart | API Gateway POST /v1/gallery/{id}/heart | 2 | WS-6 |
| gallery-admin | API Gateway POST /v1/admin/gallery/{id}/approve | 2 | WS-6 |
| referral-track | Invoked during subscribe Lambda | 2 | WS-6 |
| stripe-webhook | API Gateway POST /v1/webhooks/stripe | 3 | WS-5 |
| checkout-session | API Gateway POST /v1/checkout/session | 3 | WS-5 |
| subscription-get | API Gateway GET /v1/users/{id}/subscription | 3 | WS-5 |
| subscription-cancel | API Gateway POST /v1/users/{id}/subscription/cancel | 3 | WS-5 |
| dunning-email | EventBridge (scheduled per dunning sequence) | 3 | WS-5 |

**Total: 26 Lambda functions across 3 phases.**

---

## Appendix C: Effort Estimation Legend

| Size | Engineering Days (2 engineers) | Description |
|------|-------------------------------|-------------|
| S | 1-3 days | Simple CRUD, config change, single Lambda |
| M | 3-7 days | Multi-component feature, some integration work |
| L | 1-2 weeks | Complex feature, multiple Lambdas, frontend + backend |
| XL | 2-4 weeks | Major feature, multiple systems, significant UI, extensive testing |

---

## Appendix D: Risk Register

| Risk | Impact | Likelihood | Mitigation | Owning WS |
|------|--------|------------|------------|-----------|
| SES production access delayed | Blocks all email features | Medium | Apply in Week 1, have SendGrid as backup | WS-1 |
| OpenAI gpt-image-1 API rate limits or outages | Blocks content generation | Medium | Implement retry logic; pre-generate 2 weeks ahead; model abstraction enables fallback | WS-2 |
| CloudFront cache invalidation on deploy | Stale content served | Low | Use versioned S3 keys for content; invalidation Lambda on deploy | WS-4 |
| Stripe webhook delivery failures | Payment events missed | Low | Stripe retries for 72h; DLQ for failed webhook processing; reconciliation Lambda | WS-5 |
| Gallery upload abuse (inappropriate content) | Reputation damage | Medium | Manual review in Phase 2; AWS Rekognition in Phase 3; rate limiting | WS-6 |
| Domain warmup too aggressive | SES sending suspended | High | Strict warmup schedule; monitor bounce/complaint rates daily in Week 1-4 | WS-1 |
| Next.js SSR costs on Lambda@Edge | Unexpected AWS bill | Low | Prefer static export (SSG/ISR); SSR only if needed for dynamic content | WS-3 |

---

*This specification is the single source of truth for all engineering work on FreeReverseColoring.com. All workstream leads should reference this document for requirements, API contracts, and data models. Update this document as decisions change -- do not let it drift from reality.*
