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
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

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

    // =========================================================================
    // API Gateway — REST API
    // =========================================================================

    const api = new apigateway.RestApi(this, 'FrcApi', {
      restApiName: 'frc-api',
      description: 'FreeReverseColoring API — subscribe, confirm, and manage subscribers',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: [
          'https://freereversecoloring.com',
          'https://www.freereversecoloring.com',
          'http://localhost:3000',
        ],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type'],
      },
    });

    // /api resource
    const apiResource = api.root.addResource('api');

    // =========================================================================
    // Lambda — Subscribe Handler
    // =========================================================================

    const subscribeHandler = new lambdaNodejs.NodejsFunction(this, 'SubscribeHandler', {
      functionName: 'frc-subscribe-handler',
      entry: path.join(__dirname, '..', 'lambda', 'subscribe', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        SUBSCRIBERS_TABLE: subscribersTable.tableName,
        SES_FROM_EMAIL: 'noreply@freereversecoloring.com',
        API_BASE_URL: api.urlForPath('/'),  // will be replaced with actual URL after deploy
        SITE_URL: 'https://freereversecoloring.com',
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],  // available in Lambda runtime
      },
    });

    // Grant DynamoDB permissions: read (Query on EmailIndex) + write (PutItem, UpdateItem)
    subscribersTable.grantReadWriteData(subscribeHandler);

    // Grant SES SendEmail permission
    subscribeHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'], // SES does not support resource-level permissions for SendEmail
      }),
    );

    // Wire up POST /api/subscribe
    const subscribeResource = apiResource.addResource('subscribe');
    subscribeResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(subscribeHandler),
    );

    // =========================================================================
    // Lambda — Confirm Subscription Handler
    // =========================================================================

    const confirmHandler = new lambdaNodejs.NodejsFunction(this, 'ConfirmHandler', {
      functionName: 'frc-confirm-subscription-handler',
      entry: path.join(__dirname, '..', 'lambda', 'confirm', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        SUBSCRIBERS_TABLE: subscribersTable.tableName,
        SITE_URL: 'https://freereversecoloring.com',
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],  // available in Lambda runtime
      },
    });

    // Grant DynamoDB permissions: read (Query on ConfirmationTokenIndex, GetItem) + write (UpdateItem)
    subscribersTable.grantReadWriteData(confirmHandler);

    // Wire up GET /api/confirm
    const confirmResource = apiResource.addResource('confirm');
    confirmResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(confirmHandler),
    );

    // =========================================================================
    // Update Subscribe Lambda with actual API Gateway URL
    // =========================================================================

    // Override the API_BASE_URL env var now that the API is created.
    // The api.url includes the stage name (e.g., https://xxx.execute-api.us-east-1.amazonaws.com/prod/)
    // We need it without trailing slash for clean URL construction.
    const cfnSubscribeFunction = subscribeHandler.node.defaultChild as lambda.CfnFunction;
    cfnSubscribeFunction.addPropertyOverride(
      'Environment.Variables.API_BASE_URL',
      cdk.Fn.join('', [
        'https://',
        api.restApiId,
        '.execute-api.',
        this.region,
        '.amazonaws.com/prod',
      ]),
    );

    // =========================================================================
    // S3 — Content Bucket (generated images, thumbnails, etc.)
    // =========================================================================

    const contentBucket = new s3.Bucket(this, 'ContentBucket', {
      bucketName: `frc-content-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedOrigins: [
            'https://freereversecoloring.com',
            'https://www.freereversecoloring.com',
          ],
          allowedMethods: [s3.HttpMethods.GET],
          allowedHeaders: ['*'],
          maxAge: 86400,
        },
      ],
    });

    // =========================================================================
    // Lambda — Content Generation (GPT-4o + gpt-image-1)
    // =========================================================================

    const generateContentHandler = new lambdaNodejs.NodejsFunction(this, 'GenerateContentHandler', {
      functionName: 'frc-generate-content-handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '..', 'lambda', 'generate-content', 'index.ts'),
      handler: 'handler',
      timeout: Duration.minutes(5),
      memorySize: 1024,
      environment: {
        DESIGNS_TABLE: designsTable.tableName,
        THEME_BACKLOG_TABLE: themeBacklogTable.tableName,
        CONTENT_BUCKET: contentBucket.bucketName,
        OPENAI_SECRET_ARN: openaiApiKeySecret.secretArn,
      },
      bundling: {
        minify: false,
        sourceMap: true,
        // Do NOT externalize AWS SDK — let esbuild bundle it so we get
        // consistent versions. The openai package is also bundled.
      },
    });

    // IAM permissions for the content generation Lambda
    designsTable.grantReadWriteData(generateContentHandler);
    themeBacklogTable.grantReadWriteData(generateContentHandler);
    contentBucket.grantPut(generateContentHandler);
    openaiApiKeySecret.grantRead(generateContentHandler);

    // =========================================================================
    // Stack Outputs
    // =========================================================================

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.url,
      description: 'FRC API Gateway base URL',
    });

    new cdk.CfnOutput(this, 'ContentBucketName', {
      value: contentBucket.bucketName,
      description: 'S3 content bucket for generated designs',
    });

  }

}

