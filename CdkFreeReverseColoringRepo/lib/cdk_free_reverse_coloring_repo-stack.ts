import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { CachePolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { Duration } from 'aws-cdk-lib';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ses from 'aws-cdk-lib/aws-ses';

export class CdkFreeReverseColoringRepoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const freeReverseColoringS3Bucket = new s3.Bucket(this, "FreeReverseColoringS3Bucket", {
      publicReadAccess: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      websiteIndexDocument: "index.html",
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      })
    })

    const hostedZone = route53.PublicHostedZone.fromPublicHostedZoneAttributes(this, 'zone', {
      zoneName: 'freereversecoloring.com',
      hostedZoneId: 'Z05031851MVOWG1H65YQR',
    });

    const freeReverseColoringWebsiteCertificate = new acm.Certificate(this, 'FreeReverseColoringWebsiteCertificate', {
      domainName: '*.freereversecoloring.com',
      subjectAlternativeNames: ['freereversecoloring.com'],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // create cloudfront distribution
    const cloudfront_distribution = new cloudfront.Distribution(this, 'FreeReverseColoringWebsiteCloudFrontDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(freeReverseColoringS3Bucket),
        cachePolicy: new CachePolicy(this, "leastCachingPolicy", {
          maxTtl: Duration.seconds(120),
          minTtl: Duration.seconds(60),
          defaultTtl: Duration.seconds(120)
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      domainNames: ['www.freereversecoloring.com', 'freereversecoloring.com'],
      certificate: freeReverseColoringWebsiteCertificate
    });

    // attach DNS names in route53 to Cloudfront distribution
    const freeReverseColoringCnameRecord = new route53.CnameRecord(this, 'FreeReverseColoringCnameRecord', {
      domainName: cloudfront_distribution.domainName,
      zone: hostedZone,
      recordName: 'www',
      ttl: Duration.minutes(5)
    })
    const freeReverseColoringARecord = new route53.ARecord(this, 'FreeReverseColoringARecord', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(cloudfront_distribution))
    })

    // =========================================================================
    // DynamoDB Tables
    // =========================================================================

    // Subscribers table — stores email subscribers, confirmation tokens, referral codes
    const subscribersTable = new dynamodb.Table(this, 'SubscribersTable', {
      tableName: 'frc-subscribers',
      partitionKey: { name: 'subscriberId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    subscribersTable.addGlobalSecondaryIndex({
      indexName: 'EmailIndex',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    subscribersTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    subscribersTable.addGlobalSecondaryIndex({
      indexName: 'ConfirmationTokenIndex',
      partitionKey: { name: 'confirmationToken', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    subscribersTable.addGlobalSecondaryIndex({
      indexName: 'ReferralCodeIndex',
      partitionKey: { name: 'referralCode', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    // Designs table — stores generated reverse coloring designs per week
    const designsTable = new dynamodb.Table(this, 'DesignsTable', {
      tableName: 'frc-designs',
      partitionKey: { name: 'designId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'weekId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    designsTable.addGlobalSecondaryIndex({
      indexName: 'WeekStatusIndex',
      partitionKey: { name: 'weekId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    designsTable.addGlobalSecondaryIndex({
      indexName: 'ThemeIndex',
      partitionKey: { name: 'theme', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    designsTable.addGlobalSecondaryIndex({
      indexName: 'StatusCreatedIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Theme backlog table — stores upcoming theme ideas for generation
    const themeBacklogTable = new dynamodb.Table(this, 'ThemeBacklogTable', {
      tableName: 'frc-theme-backlog',
      partitionKey: { name: 'themeId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    themeBacklogTable.addGlobalSecondaryIndex({
      indexName: 'StatusSeasonIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'season', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // =========================================================================
    // Secrets Manager
    // =========================================================================

    // OpenAI API key — owner must update the value after deployment
    const openaiApiKeySecret = new secretsmanager.Secret(this, 'OpenAIApiKeySecret', {
      secretName: 'frc/openai-api-key',
      description: 'OpenAI API key for FreeReverseColoring AI generation pipeline',
      secretStringValue: cdk.SecretValue.unsafePlainText('PLACEHOLDER_UPDATE_ME'),
    });

    // =========================================================================
    // SES — Email Identity & Domain Verification
    // =========================================================================

    // SES domain identity with DKIM signing and custom MAIL FROM domain.
    // Using Identity.publicHostedZone() so CDK automatically creates:
    //   - 3 DKIM CNAME records in Route53
    //   - MX record for mail.freereversecoloring.com
    //   - SPF TXT record for mail.freereversecoloring.com
    const sesEmailIdentity = new ses.EmailIdentity(this, 'SesEmailIdentity', {
      identity: ses.Identity.publicHostedZone(hostedZone),
      mailFromDomain: 'mail.freereversecoloring.com',
    });

    // DMARC TXT record — instructs receiving mail servers to quarantine
    // unauthenticated messages and report all failures
    const dmarcRecord = new route53.TxtRecord(this, 'DmarcRecord', {
      zone: hostedZone,
      recordName: '_dmarc',
      values: ['v=DMARC1; p=quarantine; rct=100; fo=1'],
      ttl: Duration.minutes(60),
    });

  }

}

