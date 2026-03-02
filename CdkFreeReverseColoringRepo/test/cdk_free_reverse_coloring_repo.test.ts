import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
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

test('Only one S3 bucket exists', () => {
  template.resourceCountIs('AWS::S3::Bucket', 1);
});

test('CloudFront distribution is created with custom domain', () => {
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      Aliases: ['www.freereversecoloring.com', 'freereversecoloring.com'],
    },
  });
});

test('Route53 records exist', () => {
  template.resourceCountIs('AWS::Route53::RecordSet', 2);
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

test('Three DynamoDB tables exist', () => {
  template.resourceCountIs('AWS::DynamoDB::Table', 3);
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
