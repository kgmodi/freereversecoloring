# Implementation Plan: FreeReverseColoring.com Phase 1

**Approach:** Incremental build → test → verify → proceed. Each milestone is small, deployable, and independently testable. No milestone proceeds until its verification gate passes.

**Total Milestones:** 16 (across 4 Sprints)
**Estimated Duration:** 10-12 weeks

---

## Owner Inputs Required BEFORE Starting

These are blocking items that agents cannot resolve autonomously.

### Must Have Before Sprint 1

| # | Item | Why It's Needed | Action Required |
|---|------|----------------|-----------------|
| 1 | **OpenAI API Key** | Test AI generation locally and store in Secrets Manager | Go to https://platform.openai.com/api-keys, create new key, paste into `ReverseColoringAppAI/.env` |
| 2 | **Confirm AWS access works for CDK deploy** | CDK needs to create resources | Run `cd CdkFreeReverseColoringRepo && npx cdk diff` — if it shows a diff without errors, we're good |
| 3 | **Decision: Keep or delete ReverseColoringBookWebsiteRepo?** | Cleanup before monorepo setup | Say "delete it" or "keep it" |

### Must Have Before Sprint 2 (Email System)

| # | Item | Why It's Needed | Action Required |
|---|------|----------------|-----------------|
| 4 | **SES Production Access Request** | Sandbox limits to 200 emails/day and only verified addresses | AWS Console → Support → Create case → Service limit increase → SES Sending Limits. Request 1,000/day to start. |
| 5 | **Substack subscriber export** | Need the email list to migrate | Log into reversecoloring.substack.com → Settings → Export → Download CSV |

### Must Have Before Sprint 4 (Website Launch)

| # | Item | Why It's Needed | Action Required |
|---|------|----------------|-----------------|
| 6 | **Decision: freereversecoloringpages.com** | Need to redirect or drop it | Say "redirect to freereversecoloring.com" or "let it expire" |
| 7 | **Review and approve website design** | Final sign-off before replacing the live site | Agent will deploy to a staging URL (staging.freereversecoloring.com) for review |

### Not Needed Until Phase 3

| # | Item | Why It's Needed | Action Required |
|---|------|----------------|-----------------|
| 8 | **Stripe account + API keys** | Payment processing | Create at https://dashboard.stripe.com — not needed until month 7+ |

---

## Sprint 1: Foundation & AI Pipeline (Weeks 1-3)

**Goal:** Git repo initialized, CDK stack expanded with DynamoDB + Secrets Manager, AI generation running as a Lambda function, verified end-to-end.

### Milestone 1.1: Repository Setup & Initial Commit

**What:** Initialize root git repo, commit all existing code and docs, establish project structure.

**Tasks:**
- [x] Initialize git repo at project root
- [x] Create `.gitignore` (node_modules, .env, images, cdk.out, .claude)
- [x] Create `CLAUDE.md` with project instructions
- [ ] Create `.env.example` in ReverseColoringAppAI
- [ ] First commit with all existing code and documentation

**Verification Gate:**
```bash
git log --oneline  # Shows initial commit
git status          # Clean working tree
```

**Depends On:** Nothing
**Estimated Effort:** 1 hour

---

### Milestone 1.2: CDK Stack — DynamoDB Tables + Secrets Manager

**What:** Expand the existing CDK stack to add the core DynamoDB tables (Subscribers, Designs, ThemeBacklog) and a Secrets Manager secret for the OpenAI API key.

**Tasks:**
- [ ] Add DynamoDB `frc-subscribers` table with GSIs (email, status)
- [ ] Add DynamoDB `frc-designs` table with GSIs (weekId+status, theme)
- [ ] Add DynamoDB `frc-theme-backlog` table
- [ ] Add Secrets Manager secret `frc/openai-api-key`
- [ ] Run `cdk diff` to preview changes
- [ ] Run `cdk deploy` to create resources

**Verification Gate:**
```bash
# All three tables exist and are ACTIVE:
aws dynamodb describe-table --table-name frc-subscribers --region us-east-1 --query 'Table.TableStatus'
aws dynamodb describe-table --table-name frc-designs --region us-east-1 --query 'Table.TableStatus'
aws dynamodb describe-table --table-name frc-theme-backlog --region us-east-1 --query 'Table.TableStatus'

# Secret exists:
aws secretsmanager describe-secret --secret-id frc/openai-api-key --region us-east-1

# Tables have correct GSIs:
aws dynamodb describe-table --table-name frc-subscribers --region us-east-1 --query 'Table.GlobalSecondaryIndexes[].IndexName'
```

**Depends On:** M1.1, Owner Input #2 (AWS access confirmed)
**Estimated Effort:** 3-4 hours

---

### Milestone 1.3: Seed Theme Backlog

**What:** Populate the ThemeBacklog DynamoDB table with 52 weeks of themes (1 year). Use GPT-4o to generate them, then batch-write to DynamoDB.

**Tasks:**
- [ ] Create a seed script (`scripts/seed-themes.mjs`) that:
  - Calls GPT-4o to generate 52 themed weeks with seasonal awareness
  - Writes them to DynamoDB `frc-theme-backlog` table
  - Marks existing generated weeks (1-12) as `used`
- [ ] Run the seed script
- [ ] Verify themes in DynamoDB

**Verification Gate:**
```bash
# Count items in theme backlog:
aws dynamodb scan --table-name frc-theme-backlog --region us-east-1 --select COUNT
# Should return 52

# Spot check a theme:
aws dynamodb get-item --table-name frc-theme-backlog --key '{"themeId":{"S":"week-1"}}' --region us-east-1
```

**Depends On:** M1.2, Owner Input #1 (OpenAI API key)
**Estimated Effort:** 2-3 hours

---

### Milestone 1.4: Content Generation Lambda

**What:** Create a Lambda function that generates 3 reverse coloring designs (descriptions + images) for a given week. This is the core AI pipeline moved from local script to Lambda.

**Tasks:**
- [ ] Create Lambda function code in `CdkFreeReverseColoringRepo/lambda/generate-content/`
  - `index.ts` — handler: read theme from DynamoDB, call GPT-4o for descriptions, call gpt-image-1 for images
  - `openai-client.ts` — OpenAI SDK wrapper (reads key from Secrets Manager)
  - `image-processor.ts` — resize with sharp (thumbnail, web, print variants)
- [ ] Create S3 content bucket (`frc-content`) via CDK
- [ ] Add Lambda to CDK stack with IAM permissions (DynamoDB, S3, Secrets Manager)
- [ ] Deploy via `cdk deploy`
- [ ] Test with manual invocation

**Verification Gate:**
```bash
# Lambda exists:
aws lambda get-function --function-name frc-generate-content-handler --region us-east-1 --query 'Configuration.FunctionName'

# S3 content bucket exists:
aws s3 ls s3://frc-content-186669525308/ 2>&1

# Manual test invocation:
aws lambda invoke --function-name frc-generate-content-handler \
  --payload '{"weekId":"2026-W11","themeId":"test-theme"}' \
  --region us-east-1 /tmp/gen-response.json
cat /tmp/gen-response.json
# Should show 3 design IDs

# Verify images in S3:
aws s3 ls s3://frc-content-186669525308/designs/2026/W11/ --recursive

# Verify designs in DynamoDB:
aws dynamodb query --table-name frc-designs \
  --index-name WeekStatusIndex \
  --key-condition-expression 'weekId = :w' \
  --expression-attribute-values '{":w":{"S":"2026-W11"}}' \
  --region us-east-1 --query 'Count'
# Should return 3
```

**Depends On:** M1.2, M1.3, Owner Input #1
**Estimated Effort:** 8-10 hours (largest milestone in Sprint 1)

---

### Milestone 1.5: EventBridge Cron for Weekly Generation

**What:** Add an EventBridge rule that triggers the content generation Lambda every Monday at 6 AM UTC.

**Tasks:**
- [ ] Add EventBridge rule to CDK stack
- [ ] Deploy via `cdk deploy`
- [ ] Verify rule exists and targets the Lambda

**Verification Gate:**
```bash
# Rule exists:
aws events describe-rule --name frc-weekly-generation --region us-east-1

# Rule target is correct Lambda:
aws events list-targets-by-rule --rule frc-weekly-generation --region us-east-1

# Wait for next Monday trigger OR manually trigger:
aws events put-events --entries '[{"Source":"frc.scheduler","DetailType":"WeeklyContentGeneration","Detail":"{\"weekId\":\"2026-W11\"}"}]' --region us-east-1
```

**Depends On:** M1.4
**Estimated Effort:** 1-2 hours

---

## Sprint 2: Email & Subscriber System (Weeks 4-6)

**Goal:** SES domain verified, subscribe/unsubscribe APIs working, weekly email sending automated.

### Milestone 2.1: SES Domain Verification & Configuration

**What:** Verify freereversecoloring.com for SES sending. Configure DKIM, SPF, DMARC, custom MAIL FROM.

**Tasks:**
- [ ] Add SES domain identity to CDK stack (creates verification records in Route53)
- [ ] Add DKIM CNAME records (CDK can do this automatically with Route53)
- [ ] Add SPF TXT record
- [ ] Add DMARC TXT record
- [ ] Add custom MAIL FROM domain (mail.freereversecoloring.com)
- [ ] Deploy via `cdk deploy`
- [ ] Wait for domain verification (can take up to 72 hours)

**Verification Gate:**
```bash
# Domain is verified:
aws ses get-identity-verification-attributes --identities freereversecoloring.com --region us-east-1
# Should show "Success"

# DKIM is verified:
aws ses get-identity-dkim-attributes --identities freereversecoloring.com --region us-east-1
# Should show DkimVerificationStatus: "Success"

# Send a test email (to a verified address while in sandbox):
aws ses send-email --from hello@freereversecoloring.com \
  --destination 'ToAddresses=["owner-verified-email@example.com"]' \
  --message 'Subject={Data="Test from FRC"},Body={Text={Data="Hello from FreeReverseColoring!"}}' \
  --region us-east-1
# Should succeed
```

**Depends On:** M1.2 (Route53 hosted zone)
**Estimated Effort:** 3-4 hours (plus up to 72h wait for DNS propagation)

---

### Milestone 2.2: Subscribe Lambda + API Gateway

**What:** Create the subscribe API endpoint that accepts email signups, stores in DynamoDB, and sends a confirmation email.

**Tasks:**
- [ ] Create Lambda: `frc-subscribe-handler`
  - Validates email format
  - Creates/updates subscriber record in DynamoDB (status: pending_confirmation)
  - Generates confirmation token
  - Sends double opt-in email via SES
- [ ] Create Lambda: `frc-confirm-subscription-handler`
  - Validates token
  - Updates subscriber status to `active`
  - Redirects to welcome page
- [ ] Add API Gateway REST API to CDK stack
- [ ] Configure routes: `POST /api/subscribe`, `GET /api/confirm`
- [ ] Add CORS configuration
- [ ] Deploy via `cdk deploy`

**Verification Gate:**
```bash
# API Gateway exists:
aws apigateway get-rest-apis --region us-east-1 --query 'items[?name==`frc-api`].id'

# Test subscribe (use a real email you own while in sandbox):
curl -X POST https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","name":"Test User"}'
# Should return 200

# Verify DynamoDB record:
aws dynamodb scan --table-name frc-subscribers --region us-east-1 \
  --filter-expression 'email = :e' \
  --expression-attribute-values '{":e":{"S":"test@example.com"}}' \
  --query 'Items[0].status'
# Should show "pending_confirmation"

# Check email received (manual — check inbox for confirmation email)

# Click confirmation link, then verify status updated:
aws dynamodb scan --table-name frc-subscribers --region us-east-1 \
  --filter-expression 'email = :e' \
  --expression-attribute-values '{":e":{"S":"test@example.com"}}' \
  --query 'Items[0].status'
# Should show "active"
```

**Depends On:** M1.2, M2.1
**Estimated Effort:** 6-8 hours

---

### Milestone 2.3: Unsubscribe Lambda

**What:** Create unsubscribe endpoint with one-click support.

**Tasks:**
- [ ] Create Lambda: `frc-unsubscribe-handler`
  - Validates email + unsubscribe token
  - Updates subscriber status to `unsubscribed`
  - Returns confirmation page
- [ ] Add route: `GET /api/unsubscribe`
- [ ] Deploy and test

**Verification Gate:**
```bash
# Test unsubscribe with the test subscriber from M2.2:
curl "https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/api/unsubscribe?email=test@example.com&token=<token>"
# Should return 200

# Verify status updated:
aws dynamodb scan --table-name frc-subscribers --region us-east-1 \
  --filter-expression 'email = :e' \
  --expression-attribute-values '{":e":{"S":"test@example.com"}}' \
  --query 'Items[0].status'
# Should show "unsubscribed"
```

**Depends On:** M2.2
**Estimated Effort:** 2-3 hours

---

### Milestone 2.4: Weekly Email Send Lambda

**What:** Create the Lambda that sends the weekly newsletter to all active subscribers with this week's designs.

**Tasks:**
- [ ] Create HTML email template (responsive, image-forward)
- [ ] Create Lambda: `frc-send-weekly-email-handler`
  - Queries active subscribers from DynamoDB
  - Queries current week's approved designs
  - Renders email template per subscriber
  - Sends via SES in batches of 50
  - Records send in EmailSends DynamoDB table
- [ ] Add DynamoDB `frc-email-sends` table to CDK
- [ ] Add EventBridge rule: Wednesday 10 AM ET (14:00 UTC during EDT, 15:00 UTC during EST)
- [ ] Deploy and test

**Verification Gate:**
```bash
# Manual test (send to yourself only while in sandbox):
aws lambda invoke --function-name frc-send-weekly-email-handler \
  --payload '{"weekId":"2026-W11","testMode":true,"testEmail":"owner@example.com"}' \
  --region us-east-1 /tmp/email-response.json
cat /tmp/email-response.json

# Check inbox for the email
# Verify email renders correctly (images load, links work, unsubscribe works)

# Verify EmailSends record:
aws dynamodb scan --table-name frc-email-sends --region us-east-1 --select COUNT
```

**Depends On:** M2.1, M2.2, M1.4 (need designs to send)
**Estimated Effort:** 6-8 hours

---

### Milestone 2.5: SES Event Handling (Bounces/Complaints)

**What:** Handle SES bounce and complaint notifications to keep subscriber list clean.

**Tasks:**
- [ ] Create SNS topic for SES events
- [ ] Create Lambda: `frc-ses-event-handler`
  - On bounce: set subscriber status to `bounced`
  - On complaint: set subscriber status to `complained`
- [ ] Configure SES to publish events to SNS topic
- [ ] Deploy and test

**Verification Gate:**
```bash
# SNS topic exists:
aws sns list-topics --region us-east-1 | grep frc-ses-events

# Simulate bounce (can be done with SES mailbox simulator):
# Send email to bounce@simulator.amazonses.com
# Verify subscriber record gets updated to "bounced"
```

**Depends On:** M2.4
**Estimated Effort:** 3-4 hours

---

## Sprint 3: Website Rebuild (Weeks 7-9)

**Goal:** Modern Next.js website with gallery, design pages, signup form, deployed to S3/CloudFront.

### Milestone 3.1: Next.js Project Setup

**What:** Initialize Next.js project with Tailwind CSS, configure for static export to S3.

**Tasks:**
- [ ] Create `website/` directory at project root
- [ ] `npx create-next-app@latest` with TypeScript, Tailwind, App Router
- [ ] Configure `next.config.js` for static export (`output: 'export'`)
- [ ] Create base layout (header, footer, navigation)
- [ ] Set up Tailwind theme (colors matching brand)
- [ ] Verify local dev works (`npm run dev`)
- [ ] Verify static export works (`npm run build` produces `out/` directory)

**Verification Gate:**
```bash
cd website && npm run build
ls out/index.html  # Exists
# Open out/index.html in browser — renders correctly
```

**Depends On:** Nothing (can start in parallel with Sprint 2)
**Estimated Effort:** 3-4 hours

---

### Milestone 3.2: Homepage + Signup Form

**What:** Build the homepage with hero section, featured designs (from DynamoDB/S3), "How it Works" section, and email signup form connected to the subscribe API.

**Tasks:**
- [ ] Homepage hero with featured design image
- [ ] "How It Works" 3-step section
- [ ] Email signup form that calls `POST /api/subscribe`
- [ ] Social proof section (subscriber count, sample gallery)
- [ ] Responsive design (mobile-first)
- [ ] At build time, fetch featured designs from DynamoDB for static generation

**Verification Gate:**
```bash
npm run build  # Builds without errors
# Manual review:
# - Open in browser at multiple screen sizes
# - Submit signup form → verify API call succeeds
# - Verify images load from CloudFront
```

**Depends On:** M3.1, M2.2 (subscribe API must be deployed)
**Estimated Effort:** 6-8 hours

---

### Milestone 3.3: Gallery Page + Individual Design Pages

**What:** Gallery showing all published designs (filterable by theme), and individual design pages with download/print buttons.

**Tasks:**
- [ ] Gallery page: grid of design thumbnails, filter by theme
- [ ] Individual design page: large image, title, theme, drawing prompts, download button, print button
- [ ] Static generation: query DynamoDB at build time for all published designs
- [ ] Image optimization (next/image or manual WebP)

**Verification Gate:**
```bash
npm run build
# Count generated design pages:
find out -name "*.html" -path "*/designs/*" | wc -l
# Should match number of published designs in DynamoDB

# Manual review:
# - Gallery loads with thumbnails
# - Click a design → detail page loads
# - Download button works (downloads PNG)
# - Print button triggers browser print dialog
```

**Depends On:** M3.1, M1.4 (designs must exist in DynamoDB/S3)
**Estimated Effort:** 6-8 hours

---

### Milestone 3.4: Deploy Website to S3/CloudFront

**What:** Update GitHub Actions deploy workflow to build and deploy the Next.js static site instead of the old Mobirise site.

**Tasks:**
- [ ] Update GitHub Actions deploy workflow to build Next.js and sync to S3
- [ ] Add CloudFront behavior for `/api/*` → API Gateway
- [ ] Add cache invalidation on deploy
- [ ] Deploy to staging subdomain first (staging.freereversecoloring.com)
- [ ] After owner approval, switch production to new site

**Verification Gate:**
```bash
# Staging site loads:
curl -I https://staging.freereversecoloring.com
# Should return 200

# All pages load:
curl -s https://staging.freereversecoloring.com/ | grep "<title>"
curl -s https://staging.freereversecoloring.com/gallery | grep "<title>"

# API calls work through CloudFront:
curl -X POST https://staging.freereversecoloring.com/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"staging-test@example.com"}'

# OWNER REVIEW: Manual review of staging site before production switch
```

**Depends On:** M3.2, M3.3, M2.2, Owner Input #7 (staging approval)
**Estimated Effort:** 4-6 hours

---

## Sprint 4: Integration & Launch (Weeks 10-12)

**Goal:** Everything connected end-to-end, automated, and running in production.

### Milestone 4.1: End-to-End Pipeline Test

**What:** Test the complete automated cycle: EventBridge triggers generation → designs stored → email sent → subscriber receives email with working links.

**Tasks:**
- [ ] Trigger generation manually for a test week
- [ ] Verify designs appear in DynamoDB and S3
- [ ] Trigger email send manually for the test week
- [ ] Verify email arrives with correct content
- [ ] Click every link in the email (design pages, unsubscribe, etc.)
- [ ] Verify analytics events fire

**Verification Gate:**
```
Full cycle completes without errors:
1. ✓ Generation Lambda produces 3 designs
2. ✓ Images are in S3 at correct paths
3. ✓ Design metadata is in DynamoDB
4. ✓ Email Lambda sends to test subscriber
5. ✓ Email arrives in inbox (not spam)
6. ✓ Links in email point to correct design pages
7. ✓ Design pages load with images
8. ✓ Download/print buttons work
9. ✓ Unsubscribe link works
```

**Depends On:** All previous milestones
**Estimated Effort:** 4-6 hours

---

### Milestone 4.2: Admin Preview & Approval Flow

**What:** Add an admin preview step: after generation, send a preview email to admin. Admin clicks "Approve" to publish designs.

**Tasks:**
- [ ] Create Lambda: `frc-approve-content-handler`
- [ ] Modify generation Lambda to send admin preview email after generation
- [ ] Preview email includes: thumbnails, approve link, reject link
- [ ] Approve link updates design status to `approved`
- [ ] Only approved designs are included in Wednesday email

**Verification Gate:**
```bash
# Trigger generation → receive admin preview email
# Click approve → verify designs status updated to "approved"
# Trigger email send → only approved designs included
```

**Depends On:** M4.1
**Estimated Effort:** 3-4 hours

---

### Milestone 4.3: Monitoring & Alerting

**What:** CloudWatch dashboard, alarms for failures, weekly metrics summary.

**Tasks:**
- [ ] CloudWatch dashboard: generation success rate, email delivery rate, subscriber count, API errors
- [ ] Alarms: generation Lambda failure, email send failure, high bounce rate (>5%), high complaint rate (>0.1%)
- [ ] Weekly metrics summary Lambda (emails a report to admin)

**Verification Gate:**
```bash
# Dashboard exists:
aws cloudwatch list-dashboards --region us-east-1 | grep frc

# Alarms exist:
aws cloudwatch describe-alarms --alarm-name-prefix frc --region us-east-1 --query 'MetricAlarms[].AlarmName'
```

**Depends On:** M4.1
**Estimated Effort:** 3-4 hours

---

### Milestone 4.4: Production Launch

**What:** Switch from staging to production. Send first automated email.

**Tasks:**
- [ ] Switch CloudFront to serve new website
- [ ] Verify all DNS records correct
- [ ] Monitor first automated Monday generation
- [ ] Monitor first automated Wednesday email send
- [ ] Monitor bounce/complaint rates for 2 weeks
- [ ] Retrospective: document what worked, what didn't

**Verification Gate:**
```
Production checklist:
1. ✓ https://freereversecoloring.com loads new website
2. ✓ https://www.freereversecoloring.com redirects correctly
3. ✓ /api/subscribe works from production domain
4. ✓ Monday generation runs automatically
5. ✓ Wednesday email sends automatically
6. ✓ Email not going to spam (check with Gmail, Yahoo, Outlook)
7. ✓ Bounce rate < 2%
8. ✓ Complaint rate < 0.1%
9. ✓ All CloudWatch alarms in OK state
```

**Depends On:** All milestones, Owner Input #4 (SES production access), Owner Input #7 (staging approval)
**Estimated Effort:** 2-3 hours (plus 2 weeks monitoring)

---

## Milestone Dependency Graph

```
M1.1 (Repo Setup)
  └──> M1.2 (CDK: DynamoDB + Secrets)
         ├──> M1.3 (Seed Themes) ──> M1.4 (Generation Lambda) ──> M1.5 (EventBridge Cron)
         │                                      |
         │                                      v
         └──> M2.1 (SES Domain) ──> M2.2 (Subscribe API) ──> M2.3 (Unsubscribe)
                                         |                          |
                                         v                          v
                                    M2.4 (Email Send Lambda) ──> M2.5 (SES Events)
                                         |
                                         v
M3.1 (Next.js Setup) ──> M3.2 (Homepage) ──> M3.3 (Gallery) ──> M3.4 (Deploy to CF)
                                                                       |
                                                                       v
                                                                  M4.1 (E2E Test)
                                                                       |
                                                              ┌────────┼────────┐
                                                              v        v        v
                                                         M4.2     M4.3     M4.4
                                                        (Admin)  (Monitor) (Launch)
```

## Parallelization Opportunities

These milestones can run in parallel:

| Parallel Track A | Parallel Track B |
|-----------------|-----------------|
| M1.3 (Seed Themes) | M2.1 (SES Domain) |
| M1.4 (Gen Lambda) | M2.2 (Subscribe API) |
| M1.5 (EventBridge) | M2.3 (Unsubscribe) |
| — | M2.4 (Email Send) |
| M3.1 → M3.2 → M3.3 (Website) | M2.5 (SES Events) |

Sprint 3 (Website) can start as soon as M3.1 dependencies are met, potentially overlapping with Sprint 2.

---

## Program Manager Responsibilities

The Program Manager agent should:

1. **Check git log daily** — `git log --oneline -20` shows what's been completed
2. **Track milestone status** — maintain a status table in this file (update after each milestone)
3. **Flag blockers** — especially Owner Input items that haven't been provided
4. **Verify gates** — run the verification commands after each milestone and record results
5. **Report weekly** — summarize progress, blockers, and upcoming work

### Milestone Status Tracker

| Milestone | Status | Started | Completed | Verified | Notes |
|-----------|--------|---------|-----------|----------|-------|
| M1.1 | In Progress | 2026-03-02 | — | — | Repo init + gitignore done, need initial commit |
| M1.2 | Not Started | — | — | — | Blocked on: confirm CDK deploy works |
| M1.3 | Not Started | — | — | — | Blocked on: M1.2 + OpenAI API key |
| M1.4 | Not Started | — | — | — | Blocked on: M1.3 |
| M1.5 | Not Started | — | — | — | Blocked on: M1.4 |
| M2.1 | Not Started | — | — | — | Can start after M1.2 |
| M2.2 | Not Started | — | — | — | Blocked on: M2.1 |
| M2.3 | Not Started | — | — | — | Blocked on: M2.2 |
| M2.4 | Not Started | — | — | — | Blocked on: M2.1, M2.2, M1.4 |
| M2.5 | Not Started | — | — | — | Blocked on: M2.4 |
| M3.1 | Not Started | — | — | — | No blockers — can start anytime |
| M3.2 | Not Started | — | — | — | Blocked on: M3.1, M2.2 |
| M3.3 | Not Started | — | — | — | Blocked on: M3.1, M1.4 |
| M3.4 | Not Started | — | — | — | Blocked on: M3.2, M3.3 |
| M4.1 | Not Started | — | — | — | Blocked on: all Sprint 1-3 |
| M4.2 | Not Started | — | — | — | Blocked on: M4.1 |
| M4.3 | Not Started | — | — | — | Blocked on: M4.1 |
| M4.4 | Not Started | — | — | — | Blocked on: all + Owner approvals |

---

*This plan is the execution blueprint. Update it after every milestone completion.*
