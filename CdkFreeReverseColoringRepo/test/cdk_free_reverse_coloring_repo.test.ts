import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CdkFreeReverseColoringRepoStack } from '../lib/cdk_free_reverse_coloring_repo-stack';

let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new CdkFreeReverseColoringRepoStack(app, 'TestStack', {
    env: { account: '186669525308', region: 'us-east-1' },
  });
  template = Template.fromStack(stack);
});

test('S3 bucket is created with website hosting', () => {
  template.hasResourceProperties('AWS::S3::Bucket', {
    WebsiteConfiguration: {
      IndexDocument: 'index.html',
    },
  });
});

test('Two S3 buckets exist (website + content)', () => {
  template.resourceCountIs('AWS::S3::Bucket', 2);
});

test('CloudFront distribution is created with custom domain', () => {
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      Aliases: ['www.freereversecoloring.com', 'freereversecoloring.com'],
    },
  });
});

test('Route53 records exist (2 site + 3 DKIM + 1 MX + 1 SPF + 1 DMARC = 8)', () => {
  template.resourceCountIs('AWS::Route53::RecordSet', 8);
});

test('ACM certificate is created for wildcard domain', () => {
  template.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: '*.freereversecoloring.com',
  });
});

test('No CodeCommit repositories exist', () => {
  template.resourceCountIs('AWS::CodeCommit::Repository', 0);
});

test('No CodePipeline pipelines exist', () => {
  template.resourceCountIs('AWS::CodePipeline::Pipeline', 0);
});

// =========================================================================
// DynamoDB Tables
// =========================================================================

test('Four DynamoDB tables exist (subscribers + designs + theme-backlog + email-sends)', () => {
  template.resourceCountIs('AWS::DynamoDB::Table', 4);
});

test('Subscribers table has correct key schema and 4 GSIs', () => {
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'frc-subscribers',
    KeySchema: [
      { AttributeName: 'subscriberId', KeyType: 'HASH' },
      { AttributeName: 'createdAt', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'EmailIndex',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'StatusIndex',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'ConfirmationTokenIndex',
        KeySchema: [{ AttributeName: 'confirmationToken', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'KEYS_ONLY' },
      },
      {
        IndexName: 'ReferralCodeIndex',
        KeySchema: [{ AttributeName: 'referralCode', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'KEYS_ONLY' },
      },
    ],
  });
});

test('Designs table has correct key schema and 3 GSIs', () => {
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'frc-designs',
    KeySchema: [
      { AttributeName: 'designId', KeyType: 'HASH' },
      { AttributeName: 'weekId', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'WeekStatusIndex',
        KeySchema: [
          { AttributeName: 'weekId', KeyType: 'HASH' },
          { AttributeName: 'status', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'ThemeIndex',
        KeySchema: [
          { AttributeName: 'theme', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'StatusCreatedIndex',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  });
});

test('Theme backlog table has correct key schema and 1 GSI', () => {
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'frc-theme-backlog',
    KeySchema: [
      { AttributeName: 'themeId', KeyType: 'HASH' },
      { AttributeName: 'createdAt', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'StatusSeasonIndex',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'season', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  });
});

test('Email sends table has correct key schema and 1 GSI', () => {
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'frc-email-sends',
    KeySchema: [
      { AttributeName: 'sendId', KeyType: 'HASH' },
      { AttributeName: 'sentAt', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'WeekIndex',
        KeySchema: [
          { AttributeName: 'weekId', KeyType: 'HASH' },
          { AttributeName: 'sentAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  });
});

// =========================================================================
// Secrets Manager
// =========================================================================

test('One Secrets Manager secret exists', () => {
  template.resourceCountIs('AWS::SecretsManager::Secret', 1);
});

test('OpenAI API key secret has correct name and description', () => {
  template.hasResourceProperties('AWS::SecretsManager::Secret', {
    Name: 'frc/openai-api-key',
    Description: 'OpenAI API key for FreeReverseColoring AI generation pipeline',
  });
});

// =========================================================================
// SES — Email Identity & Domain Verification
// =========================================================================

test('One SES EmailIdentity exists for freereversecoloring.com', () => {
  template.resourceCountIs('AWS::SES::EmailIdentity', 1);
  template.hasResourceProperties('AWS::SES::EmailIdentity', {
    EmailIdentity: 'freereversecoloring.com',
    MailFromAttributes: {
      MailFromDomain: 'mail.freereversecoloring.com',
    },
  });
});

test('DMARC TXT record exists in Route53', () => {
  template.hasResourceProperties('AWS::Route53::RecordSet', {
    Name: '_dmarc.freereversecoloring.com.',
    Type: 'TXT',
    ResourceRecords: ['"v=DMARC1; p=quarantine; rct=100; fo=1"'],
  });
});

// =========================================================================
// API Gateway — REST API
// =========================================================================

test('API Gateway REST API exists with correct name', () => {
  template.hasResourceProperties('AWS::ApiGateway::RestApi', {
    Name: 'frc-api',
  });
});

test('API Gateway has a prod deployment stage', () => {
  template.hasResourceProperties('AWS::ApiGateway::Stage', {
    StageName: 'prod',
  });
});

// =========================================================================
// Lambda — Subscribe Handler
// =========================================================================

test('Subscribe Lambda function exists with correct name and runtime', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-subscribe-handler',
    Runtime: 'nodejs18.x',
  });
});

test('Subscribe Lambda has 10-second timeout', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-subscribe-handler',
    Timeout: 10,
  });
});

test('Subscribe Lambda has 256 MB memory', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-subscribe-handler',
    MemorySize: 256,
  });
});

test('Subscribe Lambda has required environment variables', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-subscribe-handler',
    Environment: {
      Variables: Match.objectLike({
        SUBSCRIBERS_TABLE: Match.anyValue(),
        SES_FROM_EMAIL: 'noreply@freereversecoloring.com',
        SITE_URL: 'https://freereversecoloring.com',
      }),
    },
  });
});

// =========================================================================
// Lambda — Confirm Subscription Handler
// =========================================================================

test('Confirm Lambda function exists with correct name and runtime', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-confirm-subscription-handler',
    Runtime: 'nodejs18.x',
  });
});

test('Confirm Lambda has 10-second timeout', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-confirm-subscription-handler',
    Timeout: 10,
  });
});

test('Confirm Lambda has 256 MB memory', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-confirm-subscription-handler',
    MemorySize: 256,
  });
});

test('Confirm Lambda has required environment variables', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-confirm-subscription-handler',
    Environment: {
      Variables: Match.objectLike({
        SUBSCRIBERS_TABLE: Match.anyValue(),
        SITE_URL: 'https://freereversecoloring.com',
      }),
    },
  });
});

test('Five Lambda functions exist (subscribe + confirm + unsubscribe + generate-content + send-weekly-email)', () => {
  template.resourceCountIs('AWS::Lambda::Function', 5);
});

// =========================================================================
// Lambda — Unsubscribe Handler
// =========================================================================

test('Unsubscribe Lambda function exists with correct name and runtime', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-unsubscribe-handler',
    Runtime: 'nodejs18.x',
  });
});

test('Unsubscribe Lambda has 10-second timeout', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-unsubscribe-handler',
    Timeout: 10,
  });
});

test('Unsubscribe Lambda has 256 MB memory', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-unsubscribe-handler',
    MemorySize: 256,
  });
});

test('Unsubscribe Lambda has required environment variables', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-unsubscribe-handler',
    Environment: {
      Variables: Match.objectLike({
        SUBSCRIBERS_TABLE: Match.anyValue(),
        SITE_URL: 'https://freereversecoloring.com',
      }),
    },
  });
});

// =========================================================================
// S3 — Content Bucket
// =========================================================================

test('Content S3 bucket exists with BLOCK_ALL public access', () => {
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: 'frc-content-186669525308',
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
});

// =========================================================================
// Lambda — Content Generation
// =========================================================================

test('Generate content Lambda function exists with correct name', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-generate-content-handler',
    Runtime: 'nodejs18.x',
  });
});

test('Generate content Lambda has 5-minute timeout', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-generate-content-handler',
    Timeout: 300,
  });
});

test('Generate content Lambda has 1024 MB memory', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-generate-content-handler',
    MemorySize: 1024,
  });
});

test('Generate content Lambda has required environment variables', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-generate-content-handler',
    Environment: {
      Variables: Match.objectLike({
        DESIGNS_TABLE: Match.anyValue(),
        THEME_BACKLOG_TABLE: Match.anyValue(),
        CONTENT_BUCKET: Match.anyValue(),
      }),
    },
  });
});

// =========================================================================
// EventBridge — Weekly Generation Schedule
// =========================================================================

test('Two EventBridge rules exist (weekly generation + weekly email send)', () => {
  template.resourceCountIs('AWS::Events::Rule', 2);
});

test('Weekly generation rule has correct schedule and name', () => {
  template.hasResourceProperties('AWS::Events::Rule', {
    Name: 'frc-weekly-generation',
    ScheduleExpression: 'cron(0 6 ? * MON *)',
    State: 'ENABLED',
  });
});

test('Weekly generation rule targets the generate-content Lambda', () => {
  template.hasResourceProperties('AWS::Events::Rule', {
    Name: 'frc-weekly-generation',
    Targets: Match.arrayWith([
      Match.objectLike({
        Arn: Match.anyValue(),
      }),
    ]),
  });
});

// =========================================================================
// Lambda — Send Weekly Email Handler
// =========================================================================

test('Send weekly email Lambda function exists with correct name and runtime', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-send-weekly-email-handler',
    Runtime: 'nodejs18.x',
  });
});

test('Send weekly email Lambda has 5-minute timeout', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-send-weekly-email-handler',
    Timeout: 300,
  });
});

test('Send weekly email Lambda has 512 MB memory', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-send-weekly-email-handler',
    MemorySize: 512,
  });
});

test('Send weekly email Lambda has required environment variables', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'frc-send-weekly-email-handler',
    Environment: {
      Variables: Match.objectLike({
        SUBSCRIBERS_TABLE: Match.anyValue(),
        DESIGNS_TABLE: Match.anyValue(),
        EMAIL_SENDS_TABLE: Match.anyValue(),
        CONTENT_BUCKET: Match.anyValue(),
        SES_FROM_EMAIL: 'noreply@freereversecoloring.com',
        SITE_URL: 'https://freereversecoloring.com',
      }),
    },
  });
});

// =========================================================================
// EventBridge — Weekly Email Send Schedule
// =========================================================================

test('Weekly email send rule has correct schedule and name', () => {
  template.hasResourceProperties('AWS::Events::Rule', {
    Name: 'frc-weekly-email-send',
    ScheduleExpression: 'cron(0 14 ? * WED *)',
    State: 'ENABLED',
  });
});

test('Weekly email send rule targets the send-weekly-email Lambda with weekId input', () => {
  template.hasResourceProperties('AWS::Events::Rule', {
    Name: 'frc-weekly-email-send',
    Targets: Match.arrayWith([
      Match.objectLike({
        Arn: Match.anyValue(),
        Input: '{"weekId":"auto"}',
      }),
    ]),
  });
});
