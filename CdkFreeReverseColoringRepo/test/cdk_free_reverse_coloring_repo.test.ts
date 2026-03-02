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
