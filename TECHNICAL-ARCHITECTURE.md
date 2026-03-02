# FreeReverseColoring.com -- Technical Architecture

**Document Version:** 1.0
**Date:** March 2, 2026
**Status:** Engineering Specification
**Audience:** Developers implementing the Phase 1-3 infrastructure

---

## Table of Contents

1. [System Architecture Diagram](#1-system-architecture-diagram)
2. [DynamoDB Table Designs](#2-dynamodb-table-designs)
3. [Lambda Function Specifications](#3-lambda-function-specifications)
4. [S3 Bucket Structure](#4-s3-bucket-structure)
5. [API Gateway Routes](#5-api-gateway-routes)
6. [EventBridge Rules](#6-eventbridge-rules)
7. [SES Configuration](#7-ses-configuration)
8. [CDK Stack Structure](#8-cdk-stack-structure)
9. [Cost Estimates](#9-cost-estimates)
10. [Security Considerations](#10-security-considerations)

---

## 1. System Architecture Diagram

```
                                 +-------------------+
                                 |   Route 53        |
                                 |   freereversecolor |
                                 |   ing.com         |
                                 +--------+----------+
                                          |
                                          | A Record / CNAME
                                          v
                                 +-------------------+
                                 |   CloudFront      |
                                 |   Distribution    |
                                 |   (CDN / HTTPS)   |
                                 |                   |
                                 |   Behaviors:      |
                                 |   /* -> S3 Website|
                                 |   /api/* -> APIGW |
                                 +--------+----------+
                                          |
                         +----------------+----------------+
                         |                                 |
                         v                                 v
              +----------+----------+           +----------+----------+
              |   S3: Website       |           |   API Gateway       |
              |   (Static Assets)   |           |   (REST API)        |
              |                     |           |   api.freereversecolor
              |   Next.js static    |           |   ing.com           |
              |   export            |           +----------+----------+
              +---------------------+                      |
                                          +----------------+----------------+
                                          |                |                |
                                          v                v                v
                                    +-----------+   +-----------+   +-----------+
                                    | Subscribe |   | Gallery   |   | Payment   |
                                    | Lambda    |   | Lambda    |   | Webhook   |
                                    | Group     |   | Group     |   | Lambda    |
                                    +-----------+   +-----------+   +-----------+
                                          |                |                |
                                          v                v                v
                                    +---------------------------------------------+
                                    |              DynamoDB Tables                 |
                                    |                                             |
                                    |  Subscribers | Designs | EmailSends |       |
                                    |  GallerySubmissions | Payments              |
                                    +---------------------------------------------+

         +-------------------+                              +-------------------+
         |   EventBridge     |                              |   Secrets Manager |
         |                   |                              |                   |
         |   Cron Rules:     |                              |   - OpenAI API Key|
         |   - Weekly Gen    |                              |   - Stripe Secret |
         |   - Weekly Email  |                              |   - Stripe Webhook|
         |   - Cleanup       |                              |     Signing Secret|
         +--------+----------+                              +-------------------+
                  |
                  v
         +--------+----------+         +-------------------+
         |   Content Gen     |-------->|   OpenAI API      |
         |   Lambda          |         |   (gpt-image-1 /  |
         |                   |         |    GPT-4o)        |
         +--------+----------+         +-------------------+
                  |
                  v
         +--------+----------+         +-------------------+
         |   Email Send      |-------->|   SES             |
         |   Lambda          |         |   (Bulk Email)    |
         |                   |         |                   |
         +--------+----------+         +--------+----------+
                                                |
                                                v
                                       +--------+----------+
                                       |   SES Events      |
                                       |   (SNS Topic)     |
                                       |                   |
                                       |   -> Bounce/      |
                                       |      Complaint    |
                                       |      Handler      |
                                       |      Lambda       |
                                       +-------------------+

         +-------------------+
         |   S3: Content     |
         |   Bucket          |
         |                   |
         |   Generated       |
         |   images, email   |
         |   templates,      |
         |   gallery uploads |
         +-------------------+

         +-------------------+
         |   CloudWatch      |
         |                   |
         |   - Lambda metrics|
         |   - SES metrics   |
         |   - Custom alarms |
         |   - Dashboard     |
         +-------------------+

         +-------------------+
         |   Stripe          |
         |   (External)      |
         |                   |
         |   Webhooks ->     |
         |   API Gateway ->  |
         |   PaymentWebhook  |
         |   Lambda          |
         +-------------------+
```

### Data Flow: Weekly Content Generation & Delivery

```
Monday 06:00 UTC                    Wednesday 06:00 UTC
     |                                     |
     v                                     v
EventBridge Cron                    EventBridge Cron
     |                                     |
     v                                     v
GenerateContent Lambda              SendWeeklyEmail Lambda
     |                                     |
     +-> Read theme backlog                +-> Query Designs table
     |   from DynamoDB                     |   (status=approved,
     |                                     |    week=current)
     +-> Call GPT-4o for                   |
     |   3 descriptions                   +-> Query Subscribers table
     |                                     |   (status=confirmed)
     +-> Call gpt-image-1 for              |
     |   3 images                          +-> Render email HTML
     |                                     |   template per subscriber
     +-> Validate image quality            |
     |   (resolution, color                +-> SES.sendBulkEmail()
     |    distribution)                    |   in batches of 50
     |                                     |
     +-> Upload images to S3              +-> Write EmailSends records
     |   content bucket                    |   to DynamoDB
     |                                     |
     +-> Write Design records              +-> Update Subscriber
     |   to DynamoDB                       |   lastEmailSentAt
     |   (status=pending_review)           |
     |                                     v
     +-> Send admin preview               Done
     |   email via SES
     |
     v
Admin clicks "Approve" link
     |
     v
ApproveContent Lambda
     |
     +-> Update Design status
         to "approved"
```

---

## 2. DynamoDB Table Designs

### 2.1 Subscribers Table

**Table Name:** `frc-subscribers`

| Attribute | Type | Key |
|-----------|------|-----|
| `subscriberId` | String (ULID) | Partition Key |
| `email` | String | -- |
| `status` | String | -- |
| `createdAt` | String (ISO 8601) | Sort Key |
| `confirmedAt` | String (ISO 8601) | -- |
| `name` | String (optional) | -- |
| `source` | String | -- |
| `preferences` | Map | -- |
| `stripeCustomerId` | String (optional) | -- |
| `subscriptionTier` | String | -- |
| `subscriptionStatus` | String (optional) | -- |
| `confirmationToken` | String | -- |
| `lastEmailSentAt` | String (ISO 8601) | -- |
| `lastOpenedAt` | String (ISO 8601) | -- |
| `lastClickedAt` | String (ISO 8601) | -- |
| `emailBounced` | Boolean | -- |
| `unsubscribedAt` | String (ISO 8601) | -- |
| `referralCode` | String | -- |
| `referredBy` | String (optional) | -- |

**GSI-1: EmailIndex**
- Partition Key: `email`
- Sort Key: none
- Projection: ALL
- Purpose: Look up subscriber by email (login, duplicate check, unsubscribe)

**GSI-2: StatusIndex**
- Partition Key: `status`
- Sort Key: `createdAt`
- Projection: ALL
- Purpose: Query all confirmed subscribers for bulk email, query pending for cleanup

**GSI-3: ConfirmationTokenIndex**
- Partition Key: `confirmationToken`
- Sort Key: none
- Projection: KEYS_ONLY
- Purpose: Look up subscriber by confirmation token during double opt-in

**GSI-4: ReferralCodeIndex**
- Partition Key: `referralCode`
- Sort Key: none
- Projection: KEYS_ONLY
- Purpose: Track referral signups

**Status values:** `pending_confirmation`, `confirmed`, `unsubscribed`, `bounced`, `complaint`

**Subscription tier values:** `free`, `premium`, `education`, `therapy`

**Preferences map structure:**
```json
{
  "themes": ["nature", "abstract", "cityscapes", "underwater"],
  "difficulty": "easy",
  "paperSize": "letter",
  "emailFrequency": "weekly"
}
```

**Sample item:**
```json
{
  "subscriberId": "01HQXYZ1234567890ABCDEF",
  "email": "sarah@example.com",
  "status": "confirmed",
  "createdAt": "2026-03-15T10:30:00Z",
  "confirmedAt": "2026-03-15T10:35:22Z",
  "name": "Sarah",
  "source": "website_signup",
  "preferences": {
    "themes": ["nature", "floral", "abstract"],
    "difficulty": "medium",
    "paperSize": "letter",
    "emailFrequency": "weekly"
  },
  "stripeCustomerId": null,
  "subscriptionTier": "free",
  "subscriptionStatus": null,
  "confirmationToken": "tok_abc123def456",
  "lastEmailSentAt": "2026-03-19T06:00:00Z",
  "lastOpenedAt": "2026-03-19T14:22:00Z",
  "lastClickedAt": "2026-03-19T14:23:15Z",
  "emailBounced": false,
  "unsubscribedAt": null,
  "referralCode": "SARAH-XK7M",
  "referredBy": null
}
```

**Access patterns:**
1. Get subscriber by ID -- PK lookup
2. Get subscriber by email -- GSI-1 query
3. Get all confirmed subscribers for email send -- GSI-2 query (status=confirmed)
4. Verify confirmation token -- GSI-3 query
5. Count subscribers by status -- GSI-2 query with count
6. Look up referral code owner -- GSI-4 query
7. Get recently lapsed subscribers (no open in 90 days) -- GSI-2 scan with filter on lastOpenedAt

---

### 2.2 Designs Table

**Table Name:** `frc-designs`

| Attribute | Type | Key |
|-----------|------|-----|
| `designId` | String (ULID) | Partition Key |
| `weekId` | String (YYYY-Wnn) | Sort Key |
| `title` | String | -- |
| `description` | String | -- |
| `theme` | String | -- |
| `difficulty` | String | -- |
| `status` | String | -- |
| `s3Key` | String | -- |
| `s3KeyHighRes` | String | -- |
| `s3KeyThumbnail` | String | -- |
| `imageUrl` | String (CloudFront URL) | -- |
| `imageUrlHighRes` | String (CloudFront URL) | -- |
| `thumbnailUrl` | String (CloudFront URL) | -- |
| `width` | Number | -- |
| `height` | Number | -- |
| `fileSizeBytes` | Number | -- |
| `colorPalette` | List of Strings | -- |
| `generationPrompt` | String | -- |
| `generationModel` | String | -- |
| `generationCostUsd` | Number | -- |
| `createdAt` | String (ISO 8601) | -- |
| `approvedAt` | String (ISO 8601) | -- |
| `publishedAt` | String (ISO 8601) | -- |
| `downloadCount` | Number | -- |
| `printCount` | Number | -- |
| `isPremium` | Boolean | -- |
| `tags` | List of Strings | -- |
| `drawingPrompts` | List of Strings | -- |

**GSI-1: WeekStatusIndex**
- Partition Key: `weekId`
- Sort Key: `status`
- Projection: ALL
- Purpose: Get all approved designs for a given week (email send), get pending designs for admin review

**GSI-2: ThemeIndex**
- Partition Key: `theme`
- Sort Key: `createdAt`
- Projection: ALL
- Purpose: Gallery filtering by theme

**GSI-3: StatusCreatedIndex**
- Partition Key: `status`
- Sort Key: `createdAt`
- Projection: ALL
- Purpose: Get all published designs (gallery), get recently published for homepage

**Status values:** `generating`, `generated`, `pending_review`, `approved`, `published`, `rejected`, `archived`

**Difficulty values:** `easy`, `medium`, `advanced`

**Sample item:**
```json
{
  "designId": "01HQABC9876543210FEDCBA",
  "weekId": "2026-W12",
  "title": "Whispers of the Deep",
  "description": "An abstract watercolor composition, rich in cool colors like blues, greens, and purples, with a hint of warm tones.",
  "theme": "ocean_life",
  "difficulty": "medium",
  "status": "published",
  "s3Key": "designs/2026/W12/whispers-of-the-deep.png",
  "s3KeyHighRes": "designs/2026/W12/whispers-of-the-deep-300dpi.png",
  "s3KeyThumbnail": "designs/2026/W12/whispers-of-the-deep-thumb.webp",
  "imageUrl": "https://content.freereversecoloring.com/designs/2026/W12/whispers-of-the-deep.png",
  "imageUrlHighRes": "https://content.freereversecoloring.com/designs/2026/W12/whispers-of-the-deep-300dpi.png",
  "thumbnailUrl": "https://content.freereversecoloring.com/designs/2026/W12/whispers-of-the-deep-thumb.webp",
  "width": 2550,
  "height": 3300,
  "fileSizeBytes": 4521984,
  "colorPalette": ["#1a4b7a", "#2d8f6e", "#6b3fa0", "#e8c547"],
  "generationPrompt": "Generate an abstract watercolor painting with no outlines. Theme: Ocean Life. Style: cool blues, greens, and purples blending organically. Light, airy watercolor washes. No text. No outlines. Suitable for printing at 8.5x11 inches.",
  "generationModel": "gpt-image-1",
  "generationCostUsd": 0.08,
  "createdAt": "2026-03-17T06:01:23Z",
  "approvedAt": "2026-03-17T14:00:00Z",
  "publishedAt": "2026-03-19T06:00:00Z",
  "downloadCount": 247,
  "printCount": 89,
  "isPremium": false,
  "tags": ["ocean", "abstract", "watercolor", "blue", "green"],
  "drawingPrompts": [
    "Draw a school of fish swimming through the blue gradients",
    "Add coral formations and sea plants along the bottom edge",
    "Create a sunken ship or treasure chest in the center"
  ]
}
```

**Access patterns:**
1. Get design by ID -- PK lookup
2. Get all designs for a specific week -- GSI-1 query (weekId=2026-W12)
3. Get approved designs for email send -- GSI-1 query (weekId=current, status=approved)
4. Get all designs for a theme (gallery filter) -- GSI-2 query
5. Get all published designs, newest first (gallery) -- GSI-3 query (status=published, ScanIndexForward=false)
6. Get pending_review designs (admin dashboard) -- GSI-3 query (status=pending_review)
7. Increment download/print count -- PK update with ADD expression

---

### 2.3 EmailSends Table

**Table Name:** `frc-email-sends`

| Attribute | Type | Key |
|-----------|------|-----|
| `sendId` | String (ULID) | Partition Key |
| `campaignId` | String | Sort Key |
| `subscriberId` | String | -- |
| `email` | String | -- |
| `templateName` | String | -- |
| `sentAt` | String (ISO 8601) | -- |
| `status` | String | -- |
| `sesMessageId` | String | -- |
| `openedAt` | String (ISO 8601) | -- |
| `clickedAt` | String (ISO 8601) | -- |
| `bouncedAt` | String (ISO 8601) | -- |
| `complainedAt` | String (ISO 8601) | -- |
| `bounceType` | String | -- |
| `designIds` | List of Strings | -- |

**GSI-1: CampaignIndex**
- Partition Key: `campaignId`
- Sort Key: `sentAt`
- Projection: ALL
- Purpose: Get all sends for a campaign (aggregate open/click rates)

**GSI-2: SubscriberEmailIndex**
- Partition Key: `subscriberId`
- Sort Key: `sentAt`
- Projection: ALL
- Purpose: Get email history for a subscriber

**GSI-3: SesMessageIndex**
- Partition Key: `sesMessageId`
- Sort Key: none
- Projection: KEYS_ONLY
- Purpose: Look up send record when SES delivers open/click/bounce notifications

**Status values:** `queued`, `sent`, `delivered`, `opened`, `clicked`, `bounced`, `complained`, `failed`

**Sample item:**
```json
{
  "sendId": "01HQDEF1111111111111111",
  "campaignId": "weekly-2026-W12",
  "subscriberId": "01HQXYZ1234567890ABCDEF",
  "email": "sarah@example.com",
  "templateName": "weekly-designs-v1",
  "sentAt": "2026-03-19T06:02:14Z",
  "status": "opened",
  "sesMessageId": "0100018e5f1a2b3c-4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a-000000",
  "openedAt": "2026-03-19T14:22:00Z",
  "clickedAt": "2026-03-19T14:23:15Z",
  "bouncedAt": null,
  "complainedAt": null,
  "bounceType": null,
  "designIds": [
    "01HQABC9876543210FEDCBA",
    "01HQABC9876543210FEDCBB",
    "01HQABC9876543210FEDCBC"
  ]
}
```

**Access patterns:**
1. Get send by ID -- PK lookup
2. Get all sends for a campaign -- GSI-1 query
3. Count opens/clicks for a campaign -- GSI-1 query with filter
4. Get email history for a subscriber -- GSI-2 query
5. Update send status from SES event -- GSI-3 query to find record, then PK update

---

### 2.4 GallerySubmissions Table

**Table Name:** `frc-gallery-submissions`

| Attribute | Type | Key |
|-----------|------|-----|
| `submissionId` | String (ULID) | Partition Key |
| `designId` | String | Sort Key |
| `subscriberId` | String | -- |
| `email` | String | -- |
| `displayName` | String | -- |
| `s3Key` | String | -- |
| `thumbnailS3Key` | String | -- |
| `imageUrl` | String (CloudFront URL) | -- |
| `thumbnailUrl` | String (CloudFront URL) | -- |
| `status` | String | -- |
| `likes` | Number | -- |
| `createdAt` | String (ISO 8601) | -- |
| `moderatedAt` | String (ISO 8601) | -- |
| `featuredInCampaign` | String (optional) | -- |

**GSI-1: DesignSubmissionsIndex**
- Partition Key: `designId`
- Sort Key: `createdAt`
- Projection: ALL
- Purpose: Get all approved submissions for a specific design

**GSI-2: StatusIndex**
- Partition Key: `status`
- Sort Key: `createdAt`
- Projection: ALL
- Purpose: Admin moderation queue (status=pending_moderation)

**GSI-3: SubscriberIndex**
- Partition Key: `subscriberId`
- Sort Key: `createdAt`
- Projection: ALL
- Purpose: Get all submissions by a subscriber (their profile)

**Status values:** `pending_moderation`, `approved`, `rejected`, `featured`

**Sample item:**
```json
{
  "submissionId": "01HQGAL0000000000000001",
  "designId": "01HQABC9876543210FEDCBA",
  "subscriberId": "01HQXYZ1234567890ABCDEF",
  "email": "sarah@example.com",
  "displayName": "Sarah M.",
  "s3Key": "gallery/2026/03/01HQGAL0000000000000001.jpg",
  "thumbnailS3Key": "gallery/2026/03/01HQGAL0000000000000001-thumb.webp",
  "imageUrl": "https://content.freereversecoloring.com/gallery/2026/03/01HQGAL0000000000000001.jpg",
  "thumbnailUrl": "https://content.freereversecoloring.com/gallery/2026/03/01HQGAL0000000000000001-thumb.webp",
  "status": "approved",
  "likes": 12,
  "createdAt": "2026-03-20T18:30:00Z",
  "moderatedAt": "2026-03-21T09:00:00Z",
  "featuredInCampaign": null
}
```

**Access patterns:**
1. Get submission by ID -- PK lookup
2. Get all submissions for a design -- GSI-1 query
3. Get moderation queue -- GSI-2 query (status=pending_moderation)
4. Get all submissions by subscriber -- GSI-3 query
5. Get featured submissions -- GSI-2 query (status=featured)
6. Increment likes -- PK update with ADD expression

---

### 2.5 Payments Table

**Table Name:** `frc-payments`

| Attribute | Type | Key |
|-----------|------|-----|
| `paymentId` | String (ULID) | Partition Key |
| `subscriberId` | String | Sort Key |
| `stripeCustomerId` | String | -- |
| `stripeSubscriptionId` | String | -- |
| `stripePaymentIntentId` | String (optional) | -- |
| `type` | String | -- |
| `status` | String | -- |
| `amountCents` | Number | -- |
| `currency` | String | -- |
| `tier` | String | -- |
| `interval` | String | -- |
| `periodStart` | String (ISO 8601) | -- |
| `periodEnd` | String (ISO 8601) | -- |
| `createdAt` | String (ISO 8601) | -- |
| `cancelledAt` | String (ISO 8601) | -- |
| `cancellationReason` | String | -- |
| `productId` | String (optional) | -- |
| `productName` | String (optional) | -- |

**GSI-1: StripeCustomerIndex**
- Partition Key: `stripeCustomerId`
- Sort Key: `createdAt`
- Projection: ALL
- Purpose: Look up payment records from Stripe webhook events

**GSI-2: StripeSubscriptionIndex**
- Partition Key: `stripeSubscriptionId`
- Sort Key: none
- Projection: ALL
- Purpose: Look up active subscription by Stripe subscription ID

**GSI-3: SubscriberPaymentsIndex**
- Partition Key: `subscriberId`
- Sort Key: `createdAt`
- Projection: ALL
- Purpose: Get payment history for a subscriber

**Type values:** `subscription`, `one_time_purchase`

**Status values:** `active`, `past_due`, `cancelled`, `payment_failed`, `trialing`, `completed`, `refunded`

**Interval values:** `monthly`, `yearly`, `one_time`

**Sample item (subscription):**
```json
{
  "paymentId": "01HQPAY0000000000000001",
  "subscriberId": "01HQXYZ1234567890ABCDEF",
  "stripeCustomerId": "cus_Abc123Def456",
  "stripeSubscriptionId": "sub_Xyz789Ghi012",
  "stripePaymentIntentId": null,
  "type": "subscription",
  "status": "active",
  "amountCents": 699,
  "currency": "usd",
  "tier": "premium",
  "interval": "monthly",
  "periodStart": "2026-07-01T00:00:00Z",
  "periodEnd": "2026-08-01T00:00:00Z",
  "createdAt": "2026-07-01T12:00:00Z",
  "cancelledAt": null,
  "cancellationReason": null,
  "productId": null,
  "productName": null
}
```

**Sample item (one-time purchase):**
```json
{
  "paymentId": "01HQPAY0000000000000002",
  "subscriberId": "01HQXYZ1234567890ABCDEF",
  "stripeCustomerId": "cus_Abc123Def456",
  "stripeSubscriptionId": null,
  "stripePaymentIntentId": "pi_Mno345Pqr678",
  "type": "one_time_purchase",
  "status": "completed",
  "amountCents": 999,
  "currency": "usd",
  "tier": null,
  "interval": "one_time",
  "periodStart": null,
  "periodEnd": null,
  "createdAt": "2026-08-15T14:30:00Z",
  "cancelledAt": null,
  "cancellationReason": null,
  "productId": "prod_ocean_dreams_pack",
  "productName": "Ocean Dreams Collection"
}
```

**Access patterns:**
1. Get payment by ID -- PK lookup
2. Get all payments for a subscriber -- GSI-3 query
3. Look up records by Stripe customer ID (webhook) -- GSI-1 query
4. Look up active subscription by Stripe subscription ID -- GSI-2 query
5. Get revenue for a period -- GSI-3 scan with filter on createdAt range and status=active|completed

---

### 2.6 ThemeBacklog Table

**Table Name:** `frc-theme-backlog`

| Attribute | Type | Key |
|-----------|------|-----|
| `themeId` | String (ULID) | Partition Key |
| `theme` | String | -- |
| `description` | String | -- |
| `season` | String | -- |
| `usedInWeek` | String (optional) | -- |
| `status` | String | -- |
| `createdAt` | String (ISO 8601) | Sort Key |
| `priority` | Number | -- |

**GSI-1: StatusSeasonIndex**
- Partition Key: `status`
- Sort Key: `season`
- Projection: ALL
- Purpose: Get unused themes for a given season

**Status values:** `available`, `used`, `retired`

**Season values:** `spring`, `summer`, `autumn`, `winter`, `any`

This table replaces the hardcoded `themes.json` file with a queryable theme backlog. The generation Lambda selects the next theme by querying available themes matching the current season and randomly picking one.

---

## 3. Lambda Function Specifications

### 3.1 SubscribeHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-subscribe-handler` |
| **Trigger** | API Gateway: `POST /api/subscribe` |
| **Runtime** | Node.js 20.x |
| **Timeout** | 10 seconds |
| **Memory** | 256 MB |
| **Description** | Handles new subscriber signups. Creates subscriber record, generates confirmation token, sends double opt-in email via SES. |

**Input:**
```json
{
  "email": "sarah@example.com",
  "name": "Sarah",
  "preferences": {
    "themes": ["nature", "abstract"],
    "difficulty": "medium"
  },
  "source": "website_signup",
  "referralCode": "JOHN-XK7M"
}
```

**Output (success):**
```json
{
  "statusCode": 200,
  "body": {
    "message": "Please check your email to confirm your subscription.",
    "subscriberId": "01HQXYZ1234567890ABCDEF"
  }
}
```

**Output (duplicate):**
```json
{
  "statusCode": 409,
  "body": {
    "message": "This email is already subscribed.",
    "status": "confirmed"
  }
}
```

**Logic:**
1. Validate email format (RFC 5322 regex)
2. Check for existing subscriber via GSI-1 (EmailIndex)
3. If exists and status=confirmed, return 409
4. If exists and status=pending_confirmation, re-send confirmation email, return 200
5. If exists and status=unsubscribed, re-create with pending_confirmation
6. Generate ULID for subscriberId
7. Generate cryptographically random confirmation token (32 bytes, hex-encoded)
8. Generate referral code (name prefix + 4 random alphanumeric)
9. Write subscriber record to DynamoDB with status=pending_confirmation
10. If referralCode provided, validate it via GSI-4, store referredBy
11. Send confirmation email via SES with link: `https://freereversecoloring.com/confirm?token={confirmationToken}`
12. Return 200

**IAM Permissions:**
- `dynamodb:PutItem` on `frc-subscribers`
- `dynamodb:Query` on `frc-subscribers/index/EmailIndex`
- `dynamodb:Query` on `frc-subscribers/index/ReferralCodeIndex`
- `ses:SendEmail` (from `noreply@freereversecoloring.com`)

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/client-ses`, `@aws-sdk/lib-dynamodb`, `ulid`

---

### 3.2 ConfirmSubscriptionHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-confirm-subscription-handler` |
| **Trigger** | API Gateway: `GET /api/confirm` |
| **Runtime** | Node.js 20.x |
| **Timeout** | 5 seconds |
| **Memory** | 128 MB |
| **Description** | Confirms subscriber email via double opt-in token. Updates status from pending_confirmation to confirmed. |

**Input (query params):**
```
?token=abc123def456
```

**Output:**
```json
{
  "statusCode": 302,
  "headers": {
    "Location": "https://freereversecoloring.com/confirmed"
  }
}
```

**Logic:**
1. Extract token from query string
2. Query GSI-3 (ConfirmationTokenIndex) for subscriber
3. If not found, redirect to error page
4. If already confirmed, redirect to "already confirmed" page
5. Update subscriber status to `confirmed`, set `confirmedAt` to now
6. Redirect to confirmation success page

**IAM Permissions:**
- `dynamodb:Query` on `frc-subscribers/index/ConfirmationTokenIndex`
- `dynamodb:UpdateItem` on `frc-subscribers`

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`

---

### 3.3 UnsubscribeHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-unsubscribe-handler` |
| **Trigger** | API Gateway: `GET /api/unsubscribe` |
| **Runtime** | Node.js 20.x |
| **Timeout** | 5 seconds |
| **Memory** | 128 MB |
| **Description** | Handles one-click unsubscribe (RFC 8058) and unsubscribe page clicks. |

**Input (query params):**
```
?id={subscriberId}&token={confirmationToken}
```

**Logic:**
1. Validate subscriberId and token match
2. Update subscriber status to `unsubscribed`, set `unsubscribedAt` to now
3. If subscriber has active Stripe subscription, do NOT cancel it here (they manage that separately)
4. Redirect to "you have been unsubscribed" page with re-subscribe option

**IAM Permissions:**
- `dynamodb:GetItem` on `frc-subscribers`
- `dynamodb:UpdateItem` on `frc-subscribers`

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`

---

### 3.4 UpdatePreferencesHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-update-preferences-handler` |
| **Trigger** | API Gateway: `PUT /api/preferences` |
| **Runtime** | Node.js 20.x |
| **Timeout** | 5 seconds |
| **Memory** | 128 MB |
| **Description** | Allows subscribers to update their theme preferences, difficulty level, and paper size. |

**Input:**
```json
{
  "subscriberId": "01HQXYZ1234567890ABCDEF",
  "token": "abc123def456",
  "preferences": {
    "themes": ["nature", "abstract", "space"],
    "difficulty": "advanced",
    "paperSize": "a4",
    "emailFrequency": "weekly"
  }
}
```

**Logic:**
1. Validate subscriberId and token match
2. Validate preferences structure (themes from allowed list, difficulty from enum, paperSize from enum)
3. Update subscriber preferences map in DynamoDB
4. Return success

**IAM Permissions:**
- `dynamodb:GetItem` on `frc-subscribers`
- `dynamodb:UpdateItem` on `frc-subscribers`

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`

---

### 3.5 GenerateContentHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-generate-content-handler` |
| **Trigger** | EventBridge: `cron(0 6 ? * MON *)` (every Monday at 06:00 UTC) |
| **Runtime** | Node.js 20.x |
| **Timeout** | 300 seconds (5 minutes) |
| **Memory** | 1024 MB |
| **Description** | Generates 3 weekly reverse coloring designs using GPT-4o + gpt-image-1 (OpenAI native image generation). Validates quality. Stores images in S3 and metadata in DynamoDB. Sends admin preview email. |

**Input (EventBridge event):**
```json
{
  "source": "frc.scheduler",
  "detail-type": "WeeklyContentGeneration",
  "detail": {
    "weekId": "2026-W12"
  }
}
```

**Logic:**
1. Calculate current weekId (ISO 8601 week)
2. Check if designs already exist for this week (idempotency)
3. Select theme from ThemeBacklog table: query available themes matching current season, pick randomly
4. Retrieve OpenAI API key from Secrets Manager
5. Call GPT-4o to generate 3 painting descriptions:
   - Include theme name, description, and constraints (no outlines, watercolor style, light shades, suitable for printing at 8.5x11)
   - Request JSON response with: title, description, colorPalette, difficulty, drawingPrompts (3 suggestions)
6. For each description, call gpt-image-1 to generate an image:
   - Prompt: "Generate an abstract watercolor painting with no outlines, no text, no letters, no words. Theme: {theme}. Description: {description}. Style: soft watercolor washes with light, airy colors. The image must be suitable for printing at 8.5x11 inches as a reverse coloring page where users will draw their own outlines on top."
   - Size: 1024x1024, then resize to 2550x3300 (300 DPI letter size) during post-processing
   - Quality: "high"
7. Decode base64 image data from gpt-image-1 response (or download from URL if returned)
8. Post-process each image:
   - Resize to 2550x3300 (letter size at 300 DPI) using sharp
   - Generate thumbnail: 400x518 WebP
   - Generate standard resolution: 1275x1650 (150 DPI) PNG
9. Upload all three versions to S3 content bucket
10. Write Design records to DynamoDB with status=pending_review
11. Mark theme as used in ThemeBacklog
12. Send admin preview email with thumbnail images and approve/reject links

**IAM Permissions:**
- `dynamodb:Query` on `frc-designs/index/WeekStatusIndex`
- `dynamodb:PutItem` on `frc-designs`
- `dynamodb:Query` on `frc-theme-backlog/index/StatusSeasonIndex`
- `dynamodb:UpdateItem` on `frc-theme-backlog`
- `s3:PutObject` on content bucket (`designs/*`)
- `secretsmanager:GetSecretValue` on `frc/openai-api-key`
- `ses:SendEmail` (admin preview)

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-ses`, `openai`, `sharp`, `ulid`

**Environment Variables:**
- `CONTENT_BUCKET`: S3 content bucket name
- `CONTENT_CDN_DOMAIN`: CloudFront domain for content
- `DESIGNS_TABLE`: DynamoDB designs table name
- `THEME_BACKLOG_TABLE`: DynamoDB theme backlog table name
- `OPENAI_SECRET_ARN`: Secrets Manager ARN for OpenAI API key
- `ADMIN_EMAIL`: Admin email address for preview notifications
- `SUBSCRIBERS_TABLE`: DynamoDB subscribers table name

---

### 3.6 ApproveContentHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-approve-content-handler` |
| **Trigger** | API Gateway: `POST /api/admin/approve` |
| **Runtime** | Node.js 20.x |
| **Timeout** | 5 seconds |
| **Memory** | 128 MB |
| **Description** | Admin endpoint to approve or reject generated designs. Uses a simple admin token for auth (not full user auth). |

**Input:**
```json
{
  "designId": "01HQABC9876543210FEDCBA",
  "action": "approve",
  "adminToken": "admin-secret-token-from-env"
}
```

**Logic:**
1. Validate admin token against environment variable
2. Get design by PK
3. If action=approve, update status to "approved", set approvedAt
4. If action=reject, update status to "rejected"
5. If all 3 designs for the week are approved, update their status to "published" and set publishedAt
6. Return success

**IAM Permissions:**
- `dynamodb:GetItem` on `frc-designs`
- `dynamodb:UpdateItem` on `frc-designs`
- `dynamodb:Query` on `frc-designs/index/WeekStatusIndex`

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`

**Environment Variables:**
- `ADMIN_TOKEN`: Simple bearer token for admin auth (from Secrets Manager, injected as env var)
- `DESIGNS_TABLE`: DynamoDB designs table name

---

### 3.7 SendWeeklyEmailHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-send-weekly-email-handler` |
| **Trigger** | EventBridge: `cron(0 6 ? * WED *)` (every Wednesday at 06:00 UTC) |
| **Runtime** | Node.js 20.x |
| **Timeout** | 900 seconds (15 minutes) |
| **Memory** | 512 MB |
| **Description** | Sends the weekly email to all confirmed subscribers with this week's approved designs. Processes in batches of 50 to stay within SES rate limits. |

**Logic:**
1. Calculate current weekId
2. Query designs for this week with status=approved or status=published via GSI-1
3. If fewer than 3 approved designs, abort and send alert to admin
4. Generate campaignId: `weekly-{weekId}`
5. Check for idempotency: if EmailSends already exist for this campaignId, skip those subscribers
6. Query all confirmed subscribers from GSI-2 (status=confirmed)
7. For each batch of 50 subscribers:
   a. Render email HTML template with design thumbnails, titles, download links
   b. Call SES `sendBulkTemplatedEmail` or individual `sendEmail` calls
   c. Write EmailSend records to DynamoDB with status=sent
   d. Wait 100ms between batches to respect SES rate limit
8. Update designs status to "published" if not already
9. Update each subscriber's lastEmailSentAt
10. Send admin summary email: total sent, any failures

**Batch processing note:** At 500 subscribers with a 100ms delay between batches of 50, the total send time is approximately 1 second for API calls plus email rendering time. At 15,000 subscribers, this becomes ~30 seconds. The 15-minute timeout provides ample headroom.

**IAM Permissions:**
- `dynamodb:Query` on `frc-designs/index/WeekStatusIndex`
- `dynamodb:Query` on `frc-subscribers/index/StatusIndex`
- `dynamodb:BatchWriteItem` on `frc-email-sends`
- `dynamodb:UpdateItem` on `frc-subscribers`
- `dynamodb:UpdateItem` on `frc-designs`
- `ses:SendEmail`
- `ses:SendBulkTemplatedEmail`

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-ses`, `ulid`, `handlebars` (email template rendering)

**Environment Variables:**
- `DESIGNS_TABLE`, `SUBSCRIBERS_TABLE`, `EMAIL_SENDS_TABLE`
- `CONTENT_CDN_DOMAIN`
- `SENDER_EMAIL`: `designs@freereversecoloring.com`
- `ADMIN_EMAIL`

---

### 3.8 SesEventHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-ses-event-handler` |
| **Trigger** | SNS Topic (SES event notifications) |
| **Runtime** | Node.js 20.x |
| **Timeout** | 10 seconds |
| **Memory** | 128 MB |
| **Description** | Processes SES delivery/bounce/complaint/open/click events. Updates EmailSends and Subscribers tables accordingly. |

**Input (SNS message wrapping SES event):**
```json
{
  "eventType": "Bounce",
  "bounce": {
    "bounceType": "Permanent",
    "bouncedRecipients": [
      { "emailAddress": "invalid@example.com" }
    ]
  },
  "mail": {
    "messageId": "0100018e5f1a2b3c..."
  }
}
```

**Logic:**
1. Parse SNS message to extract SES event
2. Look up EmailSend record by sesMessageId via GSI-3
3. Based on eventType:
   - **Delivery:** Update EmailSend status to "delivered"
   - **Open:** Update EmailSend status to "opened", set openedAt. Update Subscriber lastOpenedAt
   - **Click:** Update EmailSend status to "clicked", set clickedAt. Update Subscriber lastClickedAt
   - **Bounce (Permanent):** Update EmailSend status to "bounced". Update Subscriber status to "bounced", set emailBounced=true. This prevents future sends.
   - **Bounce (Transient):** Log only, do not change subscriber status
   - **Complaint:** Update EmailSend status to "complained". Update Subscriber status to "complaint". Immediately suppress future sends.

**IAM Permissions:**
- `dynamodb:Query` on `frc-email-sends/index/SesMessageIndex`
- `dynamodb:UpdateItem` on `frc-email-sends`
- `dynamodb:UpdateItem` on `frc-subscribers`

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`

---

### 3.9 GetDesignsHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-get-designs-handler` |
| **Trigger** | API Gateway: `GET /api/designs` |
| **Runtime** | Node.js 20.x |
| **Timeout** | 5 seconds |
| **Memory** | 256 MB |
| **Description** | Returns published designs for the gallery page. Supports pagination, theme filtering, and difficulty filtering. |

**Input (query params):**
```
?theme=ocean_life&difficulty=medium&limit=12&cursor=eyJkZXNpZ25JZC...
```

**Output:**
```json
{
  "designs": [
    {
      "designId": "01HQABC9876543210FEDCBA",
      "title": "Whispers of the Deep",
      "theme": "ocean_life",
      "difficulty": "medium",
      "thumbnailUrl": "https://content.freereversecoloring.com/...",
      "imageUrl": "https://content.freereversecoloring.com/...",
      "downloadCount": 247,
      "publishedAt": "2026-03-19T06:00:00Z",
      "drawingPrompts": ["..."],
      "tags": ["ocean", "abstract", "watercolor"]
    }
  ],
  "nextCursor": "eyJkZXNpZ25JZC..."
}
```

**Logic:**
1. If theme filter provided, query GSI-2 (ThemeIndex)
2. Otherwise, query GSI-3 (StatusCreatedIndex) with status=published
3. Apply difficulty filter as a DynamoDB filter expression
4. Handle cursor-based pagination using DynamoDB ExclusiveStartKey
5. Return designs with public-facing fields only (exclude generationPrompt, generationCost, etc.)
6. For non-premium users, exclude `imageUrlHighRes` from response

**IAM Permissions:**
- `dynamodb:Query` on `frc-designs` and its GSIs

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`

---

### 3.10 GetDesignHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-get-design-handler` |
| **Trigger** | API Gateway: `GET /api/designs/{designId}` |
| **Runtime** | Node.js 20.x |
| **Timeout** | 5 seconds |
| **Memory** | 128 MB |
| **Description** | Returns a single design by ID with full detail including gallery submissions. |

**Output:**
```json
{
  "design": { "..." },
  "submissions": [
    {
      "submissionId": "...",
      "displayName": "Sarah M.",
      "thumbnailUrl": "...",
      "likes": 12,
      "createdAt": "..."
    }
  ]
}
```

**Logic:**
1. Get design by PK
2. If status is not "published", return 404
3. Query gallery submissions for this design via GSI-1 (DesignSubmissionsIndex), limit 20
4. Return design + submissions

**IAM Permissions:**
- `dynamodb:GetItem` on `frc-designs`
- `dynamodb:Query` on `frc-gallery-submissions/index/DesignSubmissionsIndex`

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`

---

### 3.11 TrackEventHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-track-event-handler` |
| **Trigger** | API Gateway: `POST /api/track` |
| **Runtime** | Node.js 20.x |
| **Timeout** | 5 seconds |
| **Memory** | 128 MB |
| **Description** | Tracks download and print events from the website. Increments counters on the Designs table. |

**Input:**
```json
{
  "designId": "01HQABC9876543210FEDCBA",
  "event": "download"
}
```

**Logic:**
1. Validate designId exists
2. Validate event is one of: `download`, `print`
3. Increment the corresponding counter (`downloadCount` or `printCount`) on the Designs table using an ADD update expression
4. Return 200

**IAM Permissions:**
- `dynamodb:UpdateItem` on `frc-designs`

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`

---

### 3.12 GalleryUploadHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-gallery-upload-handler` |
| **Trigger** | API Gateway: `POST /api/gallery/upload` |
| **Runtime** | Node.js 20.x |
| **Timeout** | 30 seconds |
| **Memory** | 512 MB |
| **Description** | Handles user-submitted gallery photos. Validates, resizes, stores in S3, creates DynamoDB record for moderation. |

**Input (multipart/form-data):**
- `image`: JPEG/PNG file (max 10 MB)
- `designId`: String
- `subscriberId`: String
- `token`: String (confirmation token for lightweight auth)
- `displayName`: String

**Logic:**
1. Validate subscriber exists and token matches
2. Validate designId exists and is published
3. Validate file type (JPEG, PNG only) and size (max 10 MB)
4. Resize image to max 2000px on longest side using sharp
5. Generate thumbnail: 400px wide, WebP format
6. Upload both to S3 content bucket under `gallery/` prefix
7. Create GallerySubmission record with status=pending_moderation
8. Send admin notification email that a new submission needs review
9. Return submission ID

**IAM Permissions:**
- `dynamodb:GetItem` on `frc-subscribers`
- `dynamodb:GetItem` on `frc-designs`
- `dynamodb:PutItem` on `frc-gallery-submissions`
- `s3:PutObject` on content bucket (`gallery/*`)
- `ses:SendEmail` (admin notification)

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/client-ses`, `sharp`, `ulid`, `busboy` (multipart parsing)

---

### 3.13 GalleryModerateHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-gallery-moderate-handler` |
| **Trigger** | API Gateway: `POST /api/admin/gallery/moderate` |
| **Runtime** | Node.js 20.x |
| **Timeout** | 5 seconds |
| **Memory** | 128 MB |
| **Description** | Admin endpoint to approve or reject gallery submissions. |

**Input:**
```json
{
  "submissionId": "01HQGAL0000000000000001",
  "designId": "01HQABC9876543210FEDCBA",
  "action": "approve",
  "adminToken": "admin-secret-token"
}
```

**Logic:**
1. Validate admin token
2. Get submission by PK+SK
3. If action=approve, update status to "approved", set moderatedAt
4. If action=reject, update status to "rejected", set moderatedAt, optionally delete S3 objects
5. Return success

**IAM Permissions:**
- `dynamodb:GetItem` on `frc-gallery-submissions`
- `dynamodb:UpdateItem` on `frc-gallery-submissions`
- `s3:DeleteObject` on content bucket (`gallery/*`) -- for rejected submissions

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`

---

### 3.14 StripeWebhookHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-stripe-webhook-handler` |
| **Trigger** | API Gateway: `POST /api/webhooks/stripe` |
| **Runtime** | Node.js 20.x |
| **Timeout** | 10 seconds |
| **Memory** | 256 MB |
| **Description** | Handles Stripe webhook events for subscription lifecycle management. |

**Handled events:**
- `checkout.session.completed` -- New subscription or one-time purchase
- `customer.subscription.updated` -- Plan change, renewal
- `customer.subscription.deleted` -- Cancellation
- `invoice.payment_succeeded` -- Successful recurring payment
- `invoice.payment_failed` -- Failed payment (trigger grace period)

**Logic:**
1. Retrieve Stripe webhook signing secret from Secrets Manager
2. Verify webhook signature using `stripe.webhooks.constructEvent()`
3. Based on event type:

**checkout.session.completed:**
1. Extract customer email from session
2. Look up subscriber by email (GSI-1)
3. Update subscriber: set stripeCustomerId, subscriptionTier=premium, subscriptionStatus=active
4. Create Payment record with status=active

**customer.subscription.deleted:**
1. Look up payment by stripeSubscriptionId (GSI-2)
2. Update Payment status to "cancelled", set cancelledAt
3. Update Subscriber: subscriptionTier=free, subscriptionStatus=null
4. Send "sorry to see you go" email via SES

**invoice.payment_failed:**
1. Look up payment by stripeCustomerId (GSI-1)
2. Update Payment status to "payment_failed"
3. Update Subscriber subscriptionStatus to "past_due"
4. Send "payment failed" email via SES with update payment link

**IAM Permissions:**
- `dynamodb:Query` on `frc-subscribers/index/EmailIndex`
- `dynamodb:UpdateItem` on `frc-subscribers`
- `dynamodb:PutItem` on `frc-payments`
- `dynamodb:Query` on `frc-payments/index/StripeCustomerIndex`
- `dynamodb:Query` on `frc-payments/index/StripeSubscriptionIndex`
- `dynamodb:UpdateItem` on `frc-payments`
- `secretsmanager:GetSecretValue` on `frc/stripe-webhook-secret`
- `ses:SendEmail`

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-ses`, `stripe`, `ulid`

**Environment Variables:**
- `STRIPE_WEBHOOK_SECRET_ARN`: Secrets Manager ARN
- `SUBSCRIBERS_TABLE`, `PAYMENTS_TABLE`
- `SENDER_EMAIL`

---

### 3.15 WeeklyMetricsHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-weekly-metrics-handler` |
| **Trigger** | EventBridge: `cron(0 8 ? * FRI *)` (every Friday at 08:00 UTC) |
| **Runtime** | Node.js 20.x |
| **Timeout** | 60 seconds |
| **Memory** | 256 MB |
| **Description** | Calculates weekly metrics and sends summary email to admin. Also publishes custom CloudWatch metrics. |

**Metrics calculated:**
- Total subscribers (by status)
- New subscribers this week
- Email open rate (this week's campaign)
- Email click rate (this week's campaign)
- Total downloads this week
- Total prints this week
- Bounce rate
- Complaint rate
- MRR (if payments exist)
- Gallery submissions this week

**Logic:**
1. Query Subscribers table by status counts
2. Query EmailSends for current week's campaign, calculate open/click rates
3. Query Designs for download/print counts
4. Publish CloudWatch custom metrics under namespace `FreeReverseColoring`
5. Send formatted summary email to admin

**IAM Permissions:**
- `dynamodb:Query` on subscriber, design, email-send, payment tables and their GSIs
- `dynamodb:Scan` on `frc-subscribers` (for total count -- acceptable at <15K records)
- `cloudwatch:PutMetricData`
- `ses:SendEmail`

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-cloudwatch`, `@aws-sdk/client-ses`

---

### 3.16 CleanupHandler

| Property | Value |
|----------|-------|
| **Function name** | `frc-cleanup-handler` |
| **Trigger** | EventBridge: `cron(0 4 ? * SUN *)` (every Sunday at 04:00 UTC) |
| **Runtime** | Node.js 20.x |
| **Timeout** | 120 seconds |
| **Memory** | 256 MB |
| **Description** | Periodic maintenance tasks: remove expired unconfirmed subscribers, archive old email send records. |

**Logic:**
1. Query Subscribers with status=pending_confirmation and createdAt older than 7 days
2. Delete those unconfirmed subscriber records
3. Query EmailSends older than 90 days and delete them (retain aggregate metrics via CloudWatch)
4. Log summary of cleaned records

**IAM Permissions:**
- `dynamodb:Query` on `frc-subscribers/index/StatusIndex`
- `dynamodb:DeleteItem` on `frc-subscribers`
- `dynamodb:Query` on `frc-email-sends`
- `dynamodb:BatchWriteItem` (delete) on `frc-email-sends`

**Dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`

---

## 4. S3 Bucket Structure

### 4.1 Website Bucket (existing)

**Bucket name:** `frc-website-{account-id}` (current bucket, renamed for clarity)

**Purpose:** Hosts the Next.js static export. Served via CloudFront.

```
/
+-- index.html
+-- confirmed/index.html
+-- unsubscribed/index.html
+-- gallery/index.html
+-- design/[designId]/index.html    (statically generated per design)
+-- preferences/index.html
+-- about/index.html
+-- faq/index.html
+-- _next/
|   +-- static/
|       +-- css/
|       +-- js/
|       +-- media/
+-- favicon.ico
+-- robots.txt
+-- sitemap.xml
```

**CloudFront behavior:** Default behavior `/*`, cache TTL 120 seconds (as currently configured). Consider increasing to 24 hours for `_next/static/*` paths since Next.js hashes file names.

---

### 4.2 Content Bucket (new)

**Bucket name:** `frc-content-{account-id}`

**Purpose:** Stores all generated design images, gallery submissions, and email templates. Served via a separate CloudFront distribution at `content.freereversecoloring.com`.

```
/
+-- designs/
|   +-- 2026/
|       +-- W12/
|       |   +-- whispers-of-the-deep.png           (standard res, 150 DPI, ~1 MB)
|       |   +-- whispers-of-the-deep-300dpi.png     (high res, 300 DPI, ~4 MB)
|       |   +-- whispers-of-the-deep-thumb.webp      (thumbnail, 400px, ~50 KB)
|       |   +-- metropolitan-mosaic.png
|       |   +-- metropolitan-mosaic-300dpi.png
|       |   +-- metropolitan-mosaic-thumb.webp
|       |   +-- tranquil-hues.png
|       |   +-- tranquil-hues-300dpi.png
|       |   +-- tranquil-hues-thumb.webp
|       +-- W13/
|           +-- ...
|
+-- gallery/
|   +-- 2026/
|       +-- 03/
|       |   +-- {submissionId}.jpg                   (resized original, max 2000px)
|       |   +-- {submissionId}-thumb.webp            (thumbnail, 400px)
|       +-- 04/
|           +-- ...
|
+-- email-templates/
|   +-- weekly-designs-v1.html                       (Handlebars template)
|   +-- confirmation.html
|   +-- welcome.html
|   +-- re-engagement.html
|   +-- payment-failed.html
|   +-- unsubscribe-confirmation.html
|
+-- packs/                                           (Phase 3: premium digital products)
|   +-- ocean-dreams-collection/
|   |   +-- manifest.json
|   |   +-- designs/
|   |       +-- design-01.png
|   |       +-- design-01-300dpi.png
|   |       +-- ...
|   +-- four-seasons-pack/
|       +-- ...
```

**Access control:**
- `designs/` and `gallery/`: Public read via CloudFront (no direct S3 access)
- `designs/*-300dpi.png`: Restricted via CloudFront signed URLs (premium only, Phase 3)
- `email-templates/`: Private (Lambda access only, not served via CloudFront)
- `packs/`: Private (served via signed URLs after purchase verification, Phase 3)

**CloudFront distribution for content:**
- Domain: `content.freereversecoloring.com`
- Origin: S3 content bucket (OAI or OAC for access control)
- Cache TTL: 7 days for `designs/` and `gallery/` (images rarely change)
- Cache TTL: 0 for `email-templates/` (not served via CloudFront)

**Lifecycle rules:**
- `gallery/` objects older than 2 years: transition to S3 Infrequent Access
- No automatic deletion -- all content is retained

---

## 5. API Gateway Routes

### REST API: `api.freereversecoloring.com`

All routes are behind a single API Gateway REST API. CloudFront forwards `/api/*` requests to this API Gateway.

| Method | Path | Lambda Handler | Auth | Rate Limit | Description |
|--------|------|---------------|------|------------|-------------|
| `POST` | `/api/subscribe` | `frc-subscribe-handler` | None (public) | 10 req/IP/min | New subscriber signup |
| `GET` | `/api/confirm` | `frc-confirm-subscription-handler` | Token (query param) | 30 req/IP/min | Double opt-in confirmation |
| `GET` | `/api/unsubscribe` | `frc-unsubscribe-handler` | Token (query param) | 30 req/IP/min | One-click unsubscribe |
| `PUT` | `/api/preferences` | `frc-update-preferences-handler` | Token (body) | 10 req/IP/min | Update preferences |
| `GET` | `/api/designs` | `frc-get-designs-handler` | None (public) | 60 req/IP/min | List published designs |
| `GET` | `/api/designs/{designId}` | `frc-get-design-handler` | None (public) | 60 req/IP/min | Get single design detail |
| `POST` | `/api/track` | `frc-track-event-handler` | None (public) | 30 req/IP/min | Track download/print events |
| `POST` | `/api/gallery/upload` | `frc-gallery-upload-handler` | Token (body) | 5 req/IP/min | Upload gallery submission |
| `POST` | `/api/admin/approve` | `frc-approve-content-handler` | Admin token | 30 req/min | Approve/reject designs |
| `POST` | `/api/admin/gallery/moderate` | `frc-gallery-moderate-handler` | Admin token | 30 req/min | Moderate gallery submissions |
| `POST` | `/api/webhooks/stripe` | `frc-stripe-webhook-handler` | Stripe signature | 100 req/min | Stripe webhook receiver |

### Request/Response Schemas

**POST /api/subscribe -- Request:**
```json
{
  "type": "object",
  "required": ["email"],
  "properties": {
    "email": {
      "type": "string",
      "format": "email",
      "maxLength": 320
    },
    "name": {
      "type": "string",
      "maxLength": 100
    },
    "preferences": {
      "type": "object",
      "properties": {
        "themes": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["nature", "abstract", "cityscapes", "underwater", "space", "floral", "geometric", "wildlife", "desert", "mountain"]
          },
          "maxItems": 5
        },
        "difficulty": {
          "type": "string",
          "enum": ["easy", "medium", "advanced"]
        }
      }
    },
    "source": {
      "type": "string",
      "enum": ["website_signup", "referral", "social", "import"]
    },
    "referralCode": {
      "type": "string",
      "maxLength": 20
    }
  }
}
```

**POST /api/subscribe -- Response (200):**
```json
{
  "type": "object",
  "properties": {
    "message": { "type": "string" },
    "subscriberId": { "type": "string" }
  }
}
```

**GET /api/designs -- Response (200):**
```json
{
  "type": "object",
  "properties": {
    "designs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "designId": { "type": "string" },
          "title": { "type": "string" },
          "description": { "type": "string" },
          "theme": { "type": "string" },
          "difficulty": { "type": "string" },
          "thumbnailUrl": { "type": "string" },
          "imageUrl": { "type": "string" },
          "downloadCount": { "type": "number" },
          "publishedAt": { "type": "string" },
          "drawingPrompts": { "type": "array", "items": { "type": "string" } },
          "tags": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "nextCursor": { "type": "string" }
  }
}
```

**POST /api/webhooks/stripe -- Request:**

Raw body (Stripe sends the raw JSON payload). The Lambda receives it via API Gateway with the `Stripe-Signature` header preserved. API Gateway must be configured to pass the raw body (not parsed) for signature verification to work.

**Important API Gateway configuration for Stripe webhook:**
```
Binary media types: */*
(This ensures the raw body is passed through for signature verification)
```

---

## 6. EventBridge Rules

### 6.1 Weekly Content Generation

| Property | Value |
|----------|-------|
| **Rule name** | `frc-weekly-content-generation` |
| **Schedule** | `cron(0 6 ? * MON *)` |
| **Description** | Triggers content generation every Monday at 06:00 UTC (01:00 ET / 22:00 PT Sunday) |
| **Target** | `frc-generate-content-handler` Lambda |
| **Input** | `{"source":"frc.scheduler","detail-type":"WeeklyContentGeneration"}` |
| **Retry policy** | 2 retries, 60 second interval |
| **Dead-letter queue** | SNS topic `frc-dlq-notifications` -> admin email |

**Why Monday 06:00 UTC:** Gives 2 full days for admin to review and approve before Wednesday email send. If generation fails Monday, there is time to re-run manually on Tuesday.

---

### 6.2 Weekly Email Send

| Property | Value |
|----------|-------|
| **Rule name** | `frc-weekly-email-send` |
| **Schedule** | `cron(0 6 ? * WED *)` |
| **Description** | Sends weekly email to all confirmed subscribers every Wednesday at 06:00 UTC |
| **Target** | `frc-send-weekly-email-handler` Lambda |
| **Input** | `{"source":"frc.scheduler","detail-type":"WeeklyEmailSend"}` |
| **Retry policy** | 1 retry, 300 second interval |
| **Dead-letter queue** | SNS topic `frc-dlq-notifications` -> admin email |

**Why Wednesday:** Positioned as a "midweek creative break" -- aligns with VISION.md positioning. Avoids Monday (too busy) and Friday (people leaving for weekend).

---

### 6.3 Weekly Metrics Report

| Property | Value |
|----------|-------|
| **Rule name** | `frc-weekly-metrics-report` |
| **Schedule** | `cron(0 8 ? * FRI *)` |
| **Description** | Generates weekly metrics summary and sends to admin |
| **Target** | `frc-weekly-metrics-handler` Lambda |
| **Input** | `{"source":"frc.scheduler","detail-type":"WeeklyMetricsReport"}` |
| **Retry policy** | 2 retries, 120 second interval |

---

### 6.4 Cleanup

| Property | Value |
|----------|-------|
| **Rule name** | `frc-weekly-cleanup` |
| **Schedule** | `cron(0 4 ? * SUN *)` |
| **Description** | Runs cleanup tasks: remove expired pending subscribers, archive old email records |
| **Target** | `frc-cleanup-handler` Lambda |
| **Input** | `{"source":"frc.scheduler","detail-type":"WeeklyCleanup"}` |
| **Retry policy** | 2 retries, 120 second interval |

---

## 7. SES Configuration

### 7.1 Domain Verification

**Sending domain:** `freereversecoloring.com`

**Required DNS records in Route 53:**

1. **Domain identity verification (DKIM):**
   - SES generates 3 CNAME records for DKIM signing
   - Record type: CNAME
   - Names: `{token1}._domainkey.freereversecoloring.com`, `{token2}._domainkey.freereversecoloring.com`, `{token3}._domainkey.freereversecoloring.com`
   - Values: provided by SES during domain verification

2. **SPF record:**
   - Record type: TXT
   - Name: `freereversecoloring.com`
   - Value: `"v=spf1 include:amazonses.com ~all"`

3. **DMARC record:**
   - Record type: TXT
   - Name: `_dmarc.freereversecoloring.com`
   - Value: `"v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@freereversecoloring.com; pct=100"`

4. **Custom MAIL FROM domain:**
   - Record type: MX
   - Name: `mail.freereversecoloring.com`
   - Value: `10 feedback-smtp.us-east-1.amazonses.com`
   - Record type: TXT
   - Name: `mail.freereversecoloring.com`
   - Value: `"v=spf1 include:amazonses.com ~all"`

### 7.2 Sending Identities

| Identity | Purpose |
|----------|---------|
| `noreply@freereversecoloring.com` | Confirmation emails, system notifications |
| `designs@freereversecoloring.com` | Weekly design emails (the main newsletter from-address) |
| `admin@freereversecoloring.com` | Admin notifications, metrics reports |

### 7.3 Sending Quotas & Warm-up Plan

SES starts in sandbox mode. Production access must be requested.

**Production access request justification:**
- Sending newsletters to opt-in subscribers
- Double opt-in confirmation flow
- Transactional emails (confirmation, unsubscribe)
- Expected volume: 500-15,000 emails/week over 12 months

**Warm-up schedule:**
- Week 1-2: 50 emails/day (transactional only -- confirmations)
- Week 3-4: 200 emails/day (small test sends to confirmed subscribers)
- Week 5-6: 1,000 emails/day (first full weekly sends)
- Week 7+: Scale as subscriber count grows (SES auto-increases limits based on sending reputation)

**SES sending rate:** Request 14 emails/second initially. This handles 5,000 subscribers in ~6 minutes.

### 7.4 Bounce & Complaint Handling

**Configuration set:** `frc-email-tracking`

**Event destinations (via SNS):**

| Event Type | SNS Topic | Handler |
|------------|-----------|---------|
| Delivery | `frc-ses-delivery-events` | `frc-ses-event-handler` |
| Open | `frc-ses-open-events` | `frc-ses-event-handler` |
| Click | `frc-ses-click-events` | `frc-ses-event-handler` |
| Bounce | `frc-ses-bounce-events` | `frc-ses-event-handler` |
| Complaint | `frc-ses-complaint-events` | `frc-ses-event-handler` |

**Bounce handling rules:**
- **Permanent bounce (hard):** Immediately set subscriber status to "bounced". Never send again. This protects sender reputation.
- **Transient bounce (soft):** Log but do not suppress. If 3 consecutive transient bounces, treat as permanent.
- **Target bounce rate:** <2% (AWS will suspend sending above 5%)

**Complaint handling rules:**
- **Any complaint:** Immediately set subscriber status to "complaint". Never send again. This is legally required (CAN-SPAM).
- **Target complaint rate:** <0.1% (AWS will suspend above 0.5%)

### 7.5 Email Templates

All email templates use Handlebars for variable interpolation. Templates are stored in S3 (`email-templates/`) and loaded by the SendWeeklyEmail Lambda.

**Weekly designs template variables:**
```
{{subscriberName}}           -- "Sarah" or "there" if no name
{{weekTheme}}                -- "Ocean Life"
{{designs}}                  -- Array of design objects
  {{designs.title}}          -- "Whispers of the Deep"
  {{designs.thumbnailUrl}}   -- CloudFront thumbnail URL
  {{designs.designUrl}}      -- Website URL for the design page
  {{designs.difficulty}}     -- "medium"
{{unsubscribeUrl}}           -- One-click unsubscribe link
{{preferencesUrl}}           -- Preferences page link
{{subscriberId}}             -- For tracking
```

**Required email headers (CAN-SPAM compliance):**
```
List-Unsubscribe: <https://freereversecoloring.com/api/unsubscribe?id={subscriberId}&token={token}>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

---

## 8. CDK Stack Structure

### 8.1 Recommendation: Single Stack with Logical Construct Grouping

For a project of this size (sub-20 Lambda functions, <10 DynamoDB tables, 2 S3 buckets), a single CDK stack with well-organized constructs is simpler to manage than nested stacks. Nested stacks add deployment complexity (cross-stack references, deployment ordering) without meaningful benefit until the stack exceeds ~200 resources.

**File structure:**

```
CdkFreeReverseColoringRepo/
+-- bin/
|   +-- app.ts                                 (CDK app entry point)
+-- lib/
|   +-- frc-stack.ts                           (main stack)
|   +-- constructs/
|   |   +-- dns-and-certificates.ts            (Route53, ACM)
|   |   +-- website-hosting.ts                 (S3 website bucket, CloudFront)
|   |   +-- content-storage.ts                 (S3 content bucket, content CloudFront)
|   |   +-- database.ts                        (all DynamoDB tables + GSIs)
|   |   +-- api.ts                             (API Gateway + all route-Lambda wiring)
|   |   +-- subscriber-lambdas.ts              (subscribe, confirm, unsubscribe, preferences)
|   |   +-- content-generation-lambdas.ts      (generate, approve)
|   |   +-- email-lambdas.ts                   (send weekly, SES event handler)
|   |   +-- gallery-lambdas.ts                 (upload, moderate)
|   |   +-- payment-lambdas.ts                 (Stripe webhook)
|   |   +-- operations-lambdas.ts              (metrics, cleanup)
|   |   +-- email-infrastructure.ts            (SES domain, configuration set, SNS topics)
|   |   +-- scheduling.ts                      (all EventBridge rules)
|   |   +-- secrets.ts                         (Secrets Manager entries)
|   |   +-- monitoring.ts                      (CloudWatch dashboard, alarms)
|   +-- config/
|       +-- environments.ts                    (dev/prod configuration)
+-- lambda/
|   +-- shared/
|   |   +-- dynamo-client.ts                   (shared DynamoDB document client)
|   |   +-- ses-client.ts                      (shared SES client)
|   |   +-- response.ts                        (standard API Gateway response helpers)
|   |   +-- validation.ts                      (email validation, input sanitization)
|   +-- subscribe/
|   |   +-- index.ts
|   |   +-- package.json
|   +-- confirm-subscription/
|   |   +-- index.ts
|   +-- unsubscribe/
|   |   +-- index.ts
|   +-- update-preferences/
|   |   +-- index.ts
|   +-- generate-content/
|   |   +-- index.ts
|   |   +-- image-processor.ts                 (sharp resize/thumbnail logic)
|   |   +-- openai-client.ts                   (GPT-4o + gpt-image-1 wrapper)
|   |   +-- package.json                       (includes sharp, openai)
|   +-- approve-content/
|   |   +-- index.ts
|   +-- send-weekly-email/
|   |   +-- index.ts
|   |   +-- template-renderer.ts               (Handlebars template loading)
|   |   +-- package.json                       (includes handlebars)
|   +-- ses-event-handler/
|   |   +-- index.ts
|   +-- get-designs/
|   |   +-- index.ts
|   +-- get-design/
|   |   +-- index.ts
|   +-- track-event/
|   |   +-- index.ts
|   +-- gallery-upload/
|   |   +-- index.ts
|   |   +-- package.json                       (includes sharp, busboy)
|   +-- gallery-moderate/
|   |   +-- index.ts
|   +-- stripe-webhook/
|   |   +-- index.ts
|   |   +-- package.json                       (includes stripe)
|   +-- weekly-metrics/
|   |   +-- index.ts
|   +-- cleanup/
|       +-- index.ts
+-- test/
|   +-- constructs/
|       +-- database.test.ts
|       +-- api.test.ts
|       +-- ...
+-- package.json
+-- tsconfig.json
+-- cdk.json
```

### 8.2 Environment Configuration

```typescript
// lib/config/environments.ts

export interface FrcEnvironmentConfig {
  readonly envName: 'dev' | 'prod';
  readonly account: string;
  readonly region: string;
  readonly domainName: string;
  readonly contentDomainName: string;
  readonly apiDomainName: string;
  readonly hostedZoneId: string;
  readonly adminEmail: string;
  readonly senderEmail: string;
  readonly sesConfigurationSetName: string;
}

export const environments: Record<string, FrcEnvironmentConfig> = {
  dev: {
    envName: 'dev',
    account: '186669525308',
    region: 'us-east-1',
    domainName: 'dev.freereversecoloring.com',
    contentDomainName: 'content-dev.freereversecoloring.com',
    apiDomainName: 'api-dev.freereversecoloring.com',
    hostedZoneId: 'Z05031851MVOWG1H65YQR',
    adminEmail: 'admin@freereversecoloring.com',
    senderEmail: 'designs-dev@freereversecoloring.com',
    sesConfigurationSetName: 'frc-email-tracking-dev',
  },
  prod: {
    envName: 'prod',
    account: '186669525308',
    region: 'us-east-1',
    domainName: 'freereversecoloring.com',
    contentDomainName: 'content.freereversecoloring.com',
    apiDomainName: 'api.freereversecoloring.com',
    hostedZoneId: 'Z05031851MVOWG1H65YQR',
    adminEmail: 'admin@freereversecoloring.com',
    senderEmail: 'designs@freereversecoloring.com',
    sesConfigurationSetName: 'frc-email-tracking',
  },
};
```

### 8.3 CDK App Entry Point

```typescript
// bin/app.ts

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FrcStack } from '../lib/frc-stack';
import { environments } from '../lib/config/environments';

const app = new cdk.App();
const envName = app.node.tryGetContext('env') || 'dev';
const config = environments[envName];

if (!config) {
  throw new Error(`Unknown environment: ${envName}. Valid: ${Object.keys(environments).join(', ')}`);
}

new FrcStack(app, `FrcStack-${config.envName}`, {
  env: { account: config.account, region: config.region },
  config,
});
```

**Deploy commands:**
```bash
# Deploy dev
npx cdk deploy --context env=dev

# Deploy prod
npx cdk deploy --context env=prod

# Diff before deploying
npx cdk diff --context env=prod
```

### 8.4 CDK Version Upgrade Note

The current CDK version is `2.101.1` (from October 2023). This should be upgraded to the latest CDK v2 (currently `2.178.x` as of early 2026). The upgrade path is straightforward:

```bash
npm install aws-cdk-lib@latest aws-cdk@latest
```

Key improvements since 2.101.1 that this architecture benefits from:
- Improved Lambda Node.js 20.x runtime support
- Better API Gateway v2 (HTTP API) support
- CloudFront Origin Access Control (OAC) replacing Origin Access Identity (OAI)
- Improved SES v2 constructs

---

## 9. Cost Estimates

All estimates assume us-east-1 pricing. Costs are monthly.

### 9.1 At 500 Subscribers

| Service | Usage | Monthly Cost |
|---------|-------|-------------|
| **DynamoDB** | ~2,000 items across all tables. On-demand mode. ~10K reads/month, ~5K writes/month | $1.50 |
| **Lambda** | ~16 functions, ~5,000 invocations/month total, avg 500ms, 256MB avg | $0.00 (free tier) |
| **S3 (Website)** | ~50 MB static files, ~10K requests | $0.02 |
| **S3 (Content)** | ~500 MB images (~12 designs/month at ~4MB x 3 versions), ~25K requests | $0.05 |
| **CloudFront** | ~5 GB data transfer, ~50K requests | $0.50 |
| **API Gateway** | ~20K requests/month | $0.07 |
| **SES** | ~2,500 emails/month (500 subscribers x 5 emails: 4 weekly + 1 transactional) | $0.25 |
| **EventBridge** | ~20 rule invocations/month | $0.00 |
| **Secrets Manager** | 3 secrets | $1.20 |
| **Route 53** | 1 hosted zone, ~100K queries | $0.54 |
| **CloudWatch** | Basic metrics + 5 custom metrics + 1 dashboard | $3.00 |
| **OpenAI (gpt-image-1)** | ~12 images/month at $0.04-0.08/image (high quality) | $0.96 |
| **OpenAI (GPT-4o)** | ~12 text generations at ~$0.01/call | $0.12 |
| **ACM** | 2 certificates | $0.00 |
| | | |
| **Total** | | **~$8.21/month** |

---

### 9.2 At 5,000 Subscribers

| Service | Usage | Monthly Cost |
|---------|-------|-------------|
| **DynamoDB** | ~25,000 items. ~100K reads/month, ~30K writes/month | $8.00 |
| **Lambda** | ~50,000 invocations/month (email batches dominate) | $0.50 |
| **S3 (Website)** | ~50 MB, ~100K requests | $0.10 |
| **S3 (Content)** | ~2 GB, ~250K requests | $0.30 |
| **CloudFront** | ~50 GB data transfer, ~500K requests | $5.00 |
| **API Gateway** | ~200K requests/month | $0.70 |
| **SES** | ~25,000 emails/month | $2.50 |
| **EventBridge** | ~20 rule invocations/month | $0.00 |
| **Secrets Manager** | 3 secrets | $1.20 |
| **Route 53** | 1 hosted zone, ~1M queries | $0.90 |
| **CloudWatch** | Metrics + dashboard + 2 alarms | $5.00 |
| **OpenAI (gpt-image-1)** | ~40 images/month (free + premium) at $0.08 | $3.20 |
| **OpenAI (GPT-4o)** | ~40 calls at ~$0.01 | $0.40 |
| **ACM** | 2 certificates | $0.00 |
| | | |
| **Total** | | **~$27.80/month** |

---

### 9.3 At 15,000 Subscribers

| Service | Usage | Monthly Cost |
|---------|-------|-------------|
| **DynamoDB** | ~100,000 items. ~500K reads/month, ~100K writes/month. Consider switching to provisioned capacity with auto-scaling. | $25.00 |
| **Lambda** | ~200,000 invocations/month | $2.00 |
| **S3 (Website)** | ~100 MB, ~500K requests | $0.30 |
| **S3 (Content)** | ~10 GB, ~1.5M requests | $1.00 |
| **CloudFront** | ~200 GB data transfer, ~2M requests | $20.00 |
| **API Gateway** | ~1M requests/month | $3.50 |
| **SES** | ~75,000 emails/month | $7.50 |
| **EventBridge** | ~20 rule invocations/month | $0.00 |
| **Secrets Manager** | 3 secrets | $1.20 |
| **Route 53** | 1 hosted zone, ~5M queries | $2.50 |
| **CloudWatch** | Full metrics + dashboard + 5 alarms + log retention | $10.00 |
| **OpenAI (gpt-image-1)** | ~100 images/month at $0.08 | $8.00 |
| **OpenAI (GPT-4o)** | ~100 calls at ~$0.01 | $1.00 |
| **ACM** | 2 certificates | $0.00 |
| | | |
| **Total** | | **~$82.00/month** |

### 9.4 Cost vs Revenue Summary

| Scale | Monthly AWS + AI Cost | Expected MRR (Phase 3+) | Gross Margin |
|-------|----------------------|------------------------|-------------|
| 500 subs | ~$9 | $0 (pre-monetization) or ~$100 (3% conversion at $6.99) | ~91% |
| 5,000 subs | ~$29 | ~$1,050 (3% conversion at $6.99) | ~97% |
| 15,000 subs | ~$83 | ~$3,150 (3% conversion at $6.99) + digital products | ~97% |

The infrastructure costs remain negligible relative to revenue at every scale point. This is the fundamental economic advantage of serverless architecture.

---

## 10. Security Considerations

### 10.1 API Key Management

All sensitive keys are stored in AWS Secrets Manager. Lambda functions retrieve secrets at cold-start and cache them for the lifetime of the execution environment.

| Secret Name | Contents | Rotated By |
|-------------|----------|------------|
| `frc/openai-api-key` | OpenAI API key | Manual (rotate if compromised) |
| `frc/stripe-secret-key` | Stripe secret key (sk_live_...) | Manual |
| `frc/stripe-webhook-secret` | Stripe webhook endpoint signing secret (whsec_...) | Manual |
| `frc/admin-token` | Admin API authentication token | Manual (rotate quarterly) |

**Migration from current state:** The current `ReverseColoringAppAI` uses `dotenv` to load the OpenAI key from a `.env` file. This MUST be replaced with Secrets Manager retrieval in the Lambda implementation. The `.env` file must NEVER be committed to any repository.

**Secret retrieval pattern for Lambda:**
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});
let cachedSecret: string | null = null;

async function getOpenAiKey(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: process.env.OPENAI_SECRET_ARN })
  );
  cachedSecret = response.SecretString!;
  return cachedSecret;
}
```

### 10.2 CORS Configuration

API Gateway CORS must be configured to allow requests only from the website domain.

```typescript
// In CDK API construct
const api = new apigateway.RestApi(this, 'FrcApi', {
  defaultCorsPreflightOptions: {
    allowOrigins: [
      'https://freereversecoloring.com',
      'https://www.freereversecoloring.com',
      ...(config.envName === 'dev' ? ['http://localhost:3000'] : []),
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Requested-With'],
    maxAge: cdk.Duration.hours(24),
  },
});
```

### 10.3 Rate Limiting

Rate limiting is implemented at two levels:

**Level 1 -- API Gateway throttling (global):**
```typescript
const api = new apigateway.RestApi(this, 'FrcApi', {
  deployOptions: {
    throttlingBurstLimit: 100,    // max concurrent requests
    throttlingRateLimit: 50,      // requests per second
  },
});
```

**Level 2 -- Per-route usage plans:**
- Public endpoints (subscribe, designs): 60 requests/minute per IP
- Admin endpoints: 30 requests/minute (effectively unlimited for single admin)
- Stripe webhook: 100 requests/minute (Stripe can burst)
- Gallery upload: 5 requests/minute per IP (prevent abuse)

**Implementation:** API Gateway usage plans with API keys are overkill for this scale. Instead, use a simple Lambda-level rate limiter with DynamoDB:
- Key: `rate-limit#{IP}#{minute}`
- TTL: 120 seconds
- Increment with conditional check

### 10.4 Input Validation

All Lambda handlers must validate input before processing. Use a shared validation module.

**Email validation:**
```typescript
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 320;
}
```

**String sanitization:** Strip HTML tags and limit lengths on all user-provided strings (name, displayName).

**File upload validation (gallery):**
- Check Content-Type header: only `image/jpeg`, `image/png`
- Check file magic bytes (first 4 bytes) to prevent type spoofing
- Maximum file size: 10 MB
- Resize immediately to prevent serving oversized images

**Stripe webhook signature verification:**
```typescript
const event = stripe.webhooks.constructEvent(
  rawBody,
  request.headers['stripe-signature'],
  webhookSecret
);
```
This cryptographically verifies the webhook came from Stripe. Never process a Stripe webhook without this verification.

### 10.5 Email Security

**SPF (Sender Policy Framework):**
- DNS TXT record authorizing Amazon SES to send email on behalf of `freereversecoloring.com`
- Value: `"v=spf1 include:amazonses.com ~all"`
- The `~all` (softfail) is appropriate during initial setup. Migrate to `-all` (hardfail) once all legitimate sending sources are confirmed.

**DKIM (DomainKeys Identified Mail):**
- SES provides 3 CNAME records for DKIM signing
- This cryptographically signs every outgoing email, proving it was sent by an authorized sender
- Prevents email spoofing and improves deliverability

**DMARC (Domain-based Message Authentication, Reporting, and Conformance):**
- Policy: `quarantine` (emails failing SPF/DKIM checks go to spam, not inbox)
- Reporting: aggregate reports sent to `dmarc-reports@freereversecoloring.com`
- Start with `p=none` for monitoring, then escalate to `p=quarantine` after verifying no legitimate email fails

**One-click unsubscribe (RFC 8058):**
- Required by Gmail and Yahoo as of February 2024
- Every bulk email must include `List-Unsubscribe` and `List-Unsubscribe-Post` headers
- The unsubscribe link must work without requiring the user to log in

### 10.6 S3 Bucket Security

**Website bucket:**
- Public read access (required for static website hosting)
- Block public ACLs: No (required for OAI/OAC to work)
- Bucket policy: allow CloudFront OAC read access only
- No public write access

**Content bucket:**
- NOT publicly accessible
- Access via CloudFront OAC only
- Lambda functions access directly via IAM role
- Bucket policy: deny all public access, allow specific Lambda roles and CloudFront OAC

**Both buckets:**
- Server-side encryption: AES-256 (S3-managed keys, SSE-S3)
- Versioning: disabled (images are immutable once published)
- Block public access settings on the content bucket: ALL enabled (access only via CloudFront)

### 10.7 DynamoDB Security

- All tables use encryption at rest with AWS-managed keys (default)
- IAM policies follow least-privilege: each Lambda function only has access to the specific tables and indexes it needs
- No table-level `Scan` permissions except for the metrics Lambda (which needs full table counts)
- Point-in-time recovery (PITR) enabled on Subscribers and Payments tables (critical data)

### 10.8 CloudWatch Alarms

| Alarm | Metric | Threshold | Action |
|-------|--------|-----------|--------|
| `frc-generation-failure` | GenerateContentHandler errors | >= 1 in 1 hour | SNS -> admin email |
| `frc-email-send-failure` | SendWeeklyEmailHandler errors | >= 1 in 1 hour | SNS -> admin email |
| `frc-ses-bounce-rate` | SES bounce rate | >= 3% | SNS -> admin email |
| `frc-ses-complaint-rate` | SES complaint rate | >= 0.1% | SNS -> admin email |
| `frc-api-5xx-errors` | API Gateway 5xx errors | >= 5 in 5 minutes | SNS -> admin email |
| `frc-api-latency` | API Gateway p99 latency | >= 5 seconds | SNS -> admin email |
| `frc-dynamo-throttles` | DynamoDB throttled requests | >= 1 in 5 minutes | SNS -> admin email |

### 10.9 Logging

All Lambda functions log structured JSON to CloudWatch Logs.

```typescript
// Standard log format
console.log(JSON.stringify({
  level: 'INFO',
  timestamp: new Date().toISOString(),
  function: 'frc-subscribe-handler',
  action: 'subscribe',
  email: hashEmail(email),    // NEVER log raw email addresses
  subscriberId: subscriberId,
  source: source,
  duration_ms: elapsed,
}));
```

**PII handling in logs:**
- NEVER log raw email addresses -- use a one-way hash (SHA-256 of email)
- NEVER log confirmation tokens
- NEVER log Stripe customer IDs or payment details
- DO log subscriber IDs, design IDs, and non-PII metadata
- Log retention: 30 days (sufficient for debugging, keeps costs down)

---

## Appendix A: Migration Plan from Current State

### What exists today and what changes

| Component | Current State | Target State |
|-----------|--------------|-------------|
| Website hosting | S3 + CloudFront with Mobirise HTML | S3 + CloudFront with Next.js static export |
| DNS | Route 53 hosted zone (exists) | Same, add content subdomain + API subdomain |
| CDK stack | Single stack with S3 + CloudFront (GitHub Actions CI/CD) | Expanded stack with all services |
| AI pipeline | Local Node.js script with dotenv/OpenAI SDK | Lambda function with Secrets Manager/OpenAI SDK |
| Email | Substack iframe embed | SES with DynamoDB subscriber management |
| Subscriber data | Substack (not owned) | DynamoDB (owned) |
| Source control | GitHub (kgmodi/freereversecoloring) | Same, add Lambda code to CDK repo |

### Migration steps

1. **Deploy new CDK stack alongside existing.** The new stack creates new resources (DynamoDB tables, Lambdas, content S3 bucket, API Gateway). It does not modify the existing website S3 bucket or CloudFront distribution until the new website is ready.

2. **Build and test the subscriber system first.** Deploy subscribe/confirm/unsubscribe Lambdas. Test end-to-end with a small group. Verify SES deliverability.

3. **Migrate Substack subscribers.** Export CSV from Substack. Send "we're moving" email via Substack with link to re-confirm on the new system. Import confirmed subscribers to DynamoDB.

4. **Switch the website.** Once the Next.js site is built and tested, deploy it to the existing S3 website bucket via GitHub Actions. Update CloudFront to add API Gateway origin behavior.

5. **Retire the Mobirise site.** No rollback needed -- the old HTML is version-controlled in GitHub.

---

## Appendix B: Lambda Bundling Strategy

Each Lambda function is bundled independently using `aws-cdk-lib/aws-lambda-nodejs` (`NodejsFunction`), which uses esbuild for fast bundling.

```typescript
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

const subscribeHandler = new NodejsFunction(this, 'SubscribeHandler', {
  functionName: `frc-subscribe-handler-${config.envName}`,
  entry: path.join(__dirname, '../../lambda/subscribe/index.ts'),
  handler: 'handler',
  runtime: Runtime.NODEJS_20_X,
  timeout: cdk.Duration.seconds(10),
  memorySize: 256,
  environment: {
    SUBSCRIBERS_TABLE: subscribersTable.tableName,
    SENDER_EMAIL: config.senderEmail,
  },
  bundling: {
    minify: true,
    sourceMap: true,
    externalModules: ['@aws-sdk/*'],  // AWS SDK v3 is included in the Lambda runtime
  },
});
```

**Exception:** The `generate-content` and `gallery-upload` Lambdas include `sharp` (native binary), which requires a Lambda layer or Docker-based bundling:

```typescript
const generateContentHandler = new NodejsFunction(this, 'GenerateContentHandler', {
  // ...
  bundling: {
    minify: true,
    sourceMap: true,
    externalModules: ['@aws-sdk/*'],
    nodeModules: ['sharp'],  // Force sharp to be installed (not bundled by esbuild)
    forceDockerBundling: true,  // Required for sharp's native binaries
  },
});
```

---

*This document is the engineering source of truth for the FreeReverseColoring.com platform. All implementation decisions should reference this spec. Update this document when architectural decisions change.*
