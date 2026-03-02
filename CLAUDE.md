# FreeReverseColoring — Project Instructions

## Project Overview

FreeReverseColoring.com is an AI-powered reverse coloring page platform. Users receive pre-colored watercolor backgrounds weekly via email and draw their own outlines on top. The project was dormant since May 2024 and is being revived with full automation.

**Domain:** freereversecoloring.com
**AWS Account:** 186669525308 (us-east-1)
**Hosted Zone:** Z05031851MVOWG1H65YQR

## Repository Structure

```
/Users/kunal/workplace/Reversecoloring/          # Root (this git repo)
├── CLAUDE.md                                     # THIS FILE — project instructions
├── VISION.md                                     # 1-year strategic vision (CEO perspective)
├── MASTER-PRODUCT-SPEC.md                        # Full product spec with 31 features, 6 workstreams
├── TECHNICAL-ARCHITECTURE.md                     # Engineering blueprint (DynamoDB, Lambda, S3, etc.)
├── IMPLEMENTATION-PLAN.md                        # Incremental execution plan with gates
├── CdkFreeReverseColoringRepo/                   # AWS CDK stack (TypeScript)
│   └── lib/cdk_free_reverse_coloring_repo-stack.ts
├── ReverseColoringAppAI/                         # AI generation pipeline (Node.js)
│   ├── index.mjs                                 # GPT-4o + gpt-image-1 generation script
│   ├── package.json                              # openai ^4.80.0, axios, dotenv
│   └── data/                                     # Generated theme/description JSON files
├── ReverseColoringWebsiteRepo/                   # Current live static site (Mobirise HTML)
└── ReverseColoringBookWebsiteRepo/               # ABANDONED — safe to ignore/delete
```

## Tech Stack

- **AI:** OpenAI SDK directly — GPT-4o (structured JSON outputs) + gpt-image-1 (native image generation). NO LangChain.
- **Backend:** AWS CDK (TypeScript), Lambda (Node.js 20.x), DynamoDB, API Gateway, EventBridge, SES, S3, CloudFront, Secrets Manager
- **Frontend:** Next.js (static export to S3), Tailwind CSS
- **Payments:** Stripe (Phase 3)
- **Infrastructure as Code:** AWS CDK v2

## Critical Rules

1. **NO LangChain.** Use the OpenAI SDK (`openai` npm package) directly for all AI operations.
2. **Always commit after completing a milestone.** Commit messages must be thorough — include what was built, what was tested, what the result was. Git log IS the project timeline.
3. **Incremental build-test-verify.** Never build more than one milestone without testing end-to-end. Each milestone has a verification gate that MUST pass before proceeding.
4. **CDK deploys must be validated.** After every `cdk deploy`, run verification commands to confirm resources were created correctly. Log the output.
5. **No hardcoded secrets.** OpenAI API key goes in AWS Secrets Manager. No .env files in Lambda code. No keys in git.
6. **Test with real AWS services.** Unit tests are good, but every milestone MUST have an integration test against the actual deployed AWS resources.

## Git Workflow

- **Always commit from the project root** (`/Users/kunal/workplace/Reversecoloring/`)
- **Commit after every completed milestone** — not just code changes, but doc updates too
- **Commit message format:**
  ```
  [WS-N] Milestone X.Y: Short description

  What was built:
  - Bullet points of what was created/changed

  What was tested:
  - How it was verified
  - Test results

  What's next:
  - What the next milestone is

  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
  ```
- **Branch strategy:** Work on `main` for now (solo developer). Create feature branches if multiple agents work in parallel.

## Workstream Reference

| WS | Name | Focus |
|----|------|-------|
| WS-1 | Email & Subscriber System | SES, DynamoDB subscribers, subscribe/unsubscribe APIs |
| WS-2 | AI Content Pipeline | GPT-4o + gpt-image-1 Lambda, EventBridge automation, quality validation |
| WS-3 | Website Rebuild | Next.js static site, gallery, design pages, signup form |
| WS-4 | CDK Infrastructure | All AWS resources via CDK (DynamoDB, Lambda, API Gateway, SES, S3, EventBridge) |
| WS-5 | Monetization | Stripe integration, premium tier, digital products (Phase 3) |
| WS-6 | Community & Engagement | Gallery uploads, sharing, challenges (Phase 2+) |

**WS-4 is the critical path.** Almost everything depends on CDK deploying the infrastructure first.

## Current Infrastructure (Already Deployed)

- S3 bucket for static website (public read, Mobirise HTML)
- CloudFront distribution (freereversecoloring.com + www)
- GitHub Actions: CI/CD pipeline (validate → deploy to S3 → CloudFront invalidation)
- Route53 hosted zone with A record + CNAME (www)
- ACM wildcard certificate (*.freereversecoloring.com)
- SES: sandbox mode (200/day), freereversecoloring.com NOT yet verified

## Verification & Testing Standards

### For every CDK deployment:
```bash
# After cdk deploy, verify resources exist:
aws dynamodb describe-table --table-name <table> --region us-east-1
aws lambda get-function --function-name <function> --region us-east-1
aws apigateway get-rest-apis --region us-east-1
# etc.
```

### For every Lambda function:
1. Deploy the Lambda via CDK
2. Invoke it with a test event: `aws lambda invoke --function-name <name> --payload '<json>' /tmp/response.json`
3. Check the response for expected output
4. Check CloudWatch logs for errors

### For every API endpoint:
1. Deploy via CDK
2. Test with curl against the actual API Gateway URL
3. Verify DynamoDB records were created/updated correctly
4. Test error cases (invalid input, duplicate, rate limit)

### For email (SES):
1. Verify domain first (DKIM, SPF, DMARC)
2. Test with verified email addresses while in sandbox
3. Check email renders in Gmail/Apple Mail
4. Verify bounce/complaint handling

## Owner Inputs Required

These items require the project owner's action and CANNOT be done by agents:

1. **OpenAI API Key** — Must be set in `.env` for local testing and stored in AWS Secrets Manager for Lambda
2. **SES Production Access** — Requires manual request via AWS Console (Support Center > Service limit increase)
3. **Substack Export** — Log into reversecoloring.substack.com and export subscriber CSV
4. **Stripe Account** — Create Stripe account, get API keys (Phase 3)
5. **Domain freereversecoloringpages.com** — Decide: redirect to freereversecoloring.com or let expire

## Agent Team Instructions

When spinning up agents for this project:
- **Always give agents this CLAUDE.md as context**
- **Program Manager agent** should check git log frequently for status updates
- **Each agent should commit their work** before reporting completion
- **Agents working on WS-4 (CDK)** need AWS credentials available in the environment
- **No agent should skip the verification gate** — if tests fail, fix before proceeding
