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
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
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
    // Domain Redirect: freereversecoloringbook.com → freereversecoloring.com
    // =========================================================================

    const bookHostedZone = route53.PublicHostedZone.fromPublicHostedZoneAttributes(this, 'BookZone', {
      zoneName: 'freereversecoloringbook.com',
      hostedZoneId: 'Z04794052S7L3909KUMLV',
    });

    // S3 bucket configured to redirect all requests
    const bookRedirectBucket = new s3.Bucket(this, 'BookRedirectBucket', {
      bucketName: 'freereversecoloringbook.com',
      websiteRedirect: {
        hostName: 'freereversecoloring.com',
        protocol: s3.RedirectProtocol.HTTPS,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ACM certificate for the redirect domain
    const bookCertificate = new acm.Certificate(this, 'BookRedirectCertificate', {
      domainName: 'freereversecoloringbook.com',
      subjectAlternativeNames: ['www.freereversecoloringbook.com'],
      validation: acm.CertificateValidation.fromDns(bookHostedZone),
    });

    // CloudFront distribution for the redirect
    const bookRedirectDistribution = new cloudfront.Distribution(this, 'BookRedirectDistribution', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(
          `freereversecoloringbook.com.s3-website-${this.region}.amazonaws.com`,
          { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY },
        ),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      },
      domainNames: ['freereversecoloringbook.com', 'www.freereversecoloringbook.com'],
      certificate: bookCertificate,
    });

    // DNS records pointing to CloudFront
    new route53.ARecord(this, 'BookRedirectARecord', {
      zone: bookHostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(bookRedirectDistribution)),
    });

    new route53.CnameRecord(this, 'BookRedirectWwwRecord', {
      zone: bookHostedZone,
      recordName: 'www',
      domainName: bookRedirectDistribution.domainName,
      ttl: Duration.minutes(5),
    });

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

    // -------------------------------------------------------------------------
    // Gateway Responses — CORS headers on API Gateway-generated errors
    // -------------------------------------------------------------------------
    // When API Gateway itself generates error responses (e.g., 504 timeout,
    // 403 missing auth, throttling), these responses lack CORS headers by default.
    // Without these headers, the browser blocks the error response entirely,
    // and Safari/iOS shows a generic "Load failed" (TypeError) message.
    // Adding GatewayResponse for DEFAULT_4XX and DEFAULT_5XX ensures all
    // gateway-generated errors include Access-Control-Allow-Origin.

    const corsAllowOrigins = "'https://freereversecoloring.com, https://www.freereversecoloring.com, http://localhost:3000'";

    new apigateway.GatewayResponse(this, 'GatewayResponseDefault4XX', {
      restApi: api,
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': corsAllowOrigins,
        'Access-Control-Allow-Headers': "'Content-Type'",
        'Access-Control-Allow-Methods': "'POST,GET,OPTIONS'",
      },
    });

    new apigateway.GatewayResponse(this, 'GatewayResponseDefault5XX', {
      restApi: api,
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': corsAllowOrigins,
        'Access-Control-Allow-Headers': "'Content-Type'",
        'Access-Control-Allow-Methods': "'POST,GET,OPTIONS'",
      },
    });

    // /api resource
    const apiResource = api.root.addResource('api');

    // =========================================================================
    // Lambda — Subscribe Handler
    // =========================================================================

    const subscribeHandler = new lambdaNodejs.NodejsFunction(this, 'SubscribeHandler', {
      functionName: 'frc-subscribe-handler',
      description: 'Subscribe handler with rate limiting and bot protection',
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
        SES_CONFIGURATION_SET: 'frc-ses-config',
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
    // Lambda — Unsubscribe Handler
    // =========================================================================

    const unsubscribeHandler = new lambdaNodejs.NodejsFunction(this, 'UnsubscribeHandler', {
      functionName: 'frc-unsubscribe-handler',
      entry: path.join(__dirname, '..', 'lambda', 'unsubscribe', 'index.ts'),
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

    // Grant DynamoDB permissions: read (Query on EmailIndex) + write (UpdateItem)
    subscribersTable.grantReadWriteData(unsubscribeHandler);

    // Wire up GET /api/unsubscribe
    const unsubscribeResource = apiResource.addResource('unsubscribe');
    unsubscribeResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(unsubscribeHandler),
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

    // Admin token for content approval (stored as env var, not a secret since it's low-risk internal admin)
    const adminToken = 'uuPg56sM3kpOrAAkgCD9d54DcZCJzPyAy55X9rlTkBY';

    const generateContentHandler = new lambdaNodejs.NodejsFunction(this, 'GenerateContentHandler', {
      functionName: 'frc-generate-content-handler',
      description: 'Generates 3 designs per week, sends admin preview email',
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
        ADMIN_EMAIL: 'kgmodi@gmail.com',
        SES_FROM_EMAIL: 'noreply@freereversecoloring.com',
        API_BASE_URL: '', // overridden below after API is created
        ADMIN_TOKEN: adminToken,
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
    contentBucket.grantReadWrite(generateContentHandler);
    openaiApiKeySecret.grantRead(generateContentHandler);

    // SES permission for admin preview email
    generateContentHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      }),
    );

    // Override API_BASE_URL for generate content handler with actual API Gateway URL
    const cfnGenerateContentFunction = generateContentHandler.node.defaultChild as lambda.CfnFunction;
    cfnGenerateContentFunction.addPropertyOverride(
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
    // Lambda — Approve Content Handler (Admin)
    // =========================================================================

    const approveContentHandler = new lambdaNodejs.NodejsFunction(this, 'ApproveContentHandler', {
      functionName: 'frc-approve-content-handler',
      description: 'Admin approve/reject endpoint for generated designs',
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '..', 'lambda', 'approve-content', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        DESIGNS_TABLE: designsTable.tableName,
        ADMIN_TOKEN: adminToken,
        SITE_URL: 'https://freereversecoloring.com',
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Grant DynamoDB permissions: read (Query on WeekStatusIndex) + write (UpdateItem)
    designsTable.grantReadWriteData(approveContentHandler);

    // Wire up GET /api/admin/approve
    const adminResource = apiResource.addResource('admin');
    const approveResource = adminResource.addResource('approve');
    approveResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(approveContentHandler),
    );

    // =========================================================================
    // EventBridge — Weekly Content Generation Schedule
    // =========================================================================

    // Triggers content generation every Monday at 6 AM UTC.
    // The Lambda determines the current week ID at invocation time,
    // so no payload is needed from the rule.
    const weeklyGenerationRule = new events.Rule(this, 'WeeklyGenerationRule', {
      ruleName: 'frc-weekly-generation',
      description: 'Triggers AI content generation every Monday at 6 AM UTC',
      schedule: events.Schedule.expression('cron(0 6 ? * MON *)'),
    });

    weeklyGenerationRule.addTarget(
      new eventsTargets.LambdaFunction(generateContentHandler),
    );

    // =========================================================================
    // Lambda — Approval Reminder (Tuesday morning)
    // =========================================================================

    const approvalReminderHandler = new lambdaNodejs.NodejsFunction(this, 'ApprovalReminderHandler', {
      functionName: 'frc-approval-reminder-handler',
      description: 'Sends admin reminder with image previews if designs are still pending_review on Tuesday morning',
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '..', 'lambda', 'approval-reminder', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        DESIGNS_TABLE: designsTable.tableName,
        CONTENT_BUCKET: contentBucket.bucketName,
        ADMIN_EMAIL: 'kgmodi@gmail.com',
        SES_FROM_EMAIL: 'noreply@freereversecoloring.com',
        API_BASE_URL: '', // overridden below
        ADMIN_TOKEN: adminToken,
      },
      bundling: {
        minify: false,
        sourceMap: true,
        // Do NOT externalize AWS SDK — bundle everything including
        // @aws-sdk/s3-request-presigner which is not in the Lambda runtime.
      },
    });

    // Permissions: read designs table, read S3 for presigned URLs, send email via SES
    designsTable.grantReadData(approvalReminderHandler);
    contentBucket.grantRead(approvalReminderHandler);
    approvalReminderHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      }),
    );

    // Override API_BASE_URL with actual API Gateway URL
    const cfnApprovalReminderFunction = approvalReminderHandler.node.defaultChild as lambda.CfnFunction;
    cfnApprovalReminderFunction.addPropertyOverride(
      'Environment.Variables.API_BASE_URL',
      cdk.Fn.join('', [
        'https://',
        api.restApiId,
        '.execute-api.',
        this.region,
        '.amazonaws.com/prod',
      ]),
    );

    // EventBridge: Tuesday 10 AM ET (14:00 UTC) — one day before Wednesday email
    const tuesdayReminderRule = new events.Rule(this, 'TuesdayApprovalReminderRule', {
      ruleName: 'frc-tuesday-approval-reminder',
      description: 'Reminds admin to approve designs every Tuesday at 10 AM ET (14:00 UTC)',
      schedule: events.Schedule.expression('cron(0 14 ? * TUE *)'),
    });

    tuesdayReminderRule.addTarget(
      new eventsTargets.LambdaFunction(approvalReminderHandler),
    );

    // =========================================================================
    // DynamoDB — Email Sends Table
    // =========================================================================

    const emailSendsTable = new dynamodb.Table(this, 'EmailSendsTable', {
      tableName: 'frc-email-sends',
      partitionKey: { name: 'sendId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sentAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    emailSendsTable.addGlobalSecondaryIndex({
      indexName: 'WeekIndex',
      partitionKey: { name: 'weekId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sentAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // DynamoDB Table — Email engagement events (opens, clicks, bounces, complaints)
    const emailEventsTable = new dynamodb.Table(this, 'EmailEventsTable', {
      tableName: 'frc-email-events',
      partitionKey: { name: 'messageId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'eventTimestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    emailEventsTable.addGlobalSecondaryIndex({
      indexName: 'EventTypeIndex',
      partitionKey: { name: 'eventType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'eventTimestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // =========================================================================
    // Lambda — Send Weekly Email Handler
    // =========================================================================

    const sendWeeklyEmailHandler = new lambdaNodejs.NodejsFunction(this, 'SendWeeklyEmailHandler', {
      functionName: 'frc-send-weekly-email-handler',
      description: 'Sends weekly email with max 3 designs, gallery links, formatted theme names',
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '..', 'lambda', 'send-weekly-email', 'index.ts'),
      handler: 'handler',
      timeout: Duration.minutes(5),
      memorySize: 512,
      environment: {
        SUBSCRIBERS_TABLE: subscribersTable.tableName,
        DESIGNS_TABLE: designsTable.tableName,
        EMAIL_SENDS_TABLE: emailSendsTable.tableName,
        CONTENT_BUCKET: contentBucket.bucketName,
        SES_FROM_EMAIL: 'noreply@freereversecoloring.com',
        API_BASE_URL: api.urlForPath('/'),  // overridden below
        SITE_URL: 'https://freereversecoloring.com',
        SES_CONFIGURATION_SET: 'frc-ses-config',
      },
      bundling: {
        minify: false,
        sourceMap: true,
        // Do NOT externalize AWS SDK — bundle everything including
        // @aws-sdk/s3-request-presigner which is not in the Lambda runtime.
      },
    });

    // IAM permissions
    subscribersTable.grantReadData(sendWeeklyEmailHandler);
    designsTable.grantReadData(sendWeeklyEmailHandler);
    emailSendsTable.grantReadWriteData(sendWeeklyEmailHandler);
    contentBucket.grantRead(sendWeeklyEmailHandler);

    // SES SendEmail permission
    sendWeeklyEmailHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      }),
    );

    // Override API_BASE_URL with the actual API Gateway URL (same pattern as subscribe handler)
    const cfnSendWeeklyEmailFunction = sendWeeklyEmailHandler.node.defaultChild as lambda.CfnFunction;
    cfnSendWeeklyEmailFunction.addPropertyOverride(
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
    // EventBridge — Weekly Email Send Schedule (Wednesday 10 AM ET)
    // =========================================================================

    const weeklyEmailSendRule = new events.Rule(this, 'WeeklyEmailSendRule', {
      ruleName: 'frc-weekly-email-send',
      description: 'Sends weekly reverse coloring email every Wednesday at 10 AM ET (14:00 UTC)',
      schedule: events.Schedule.expression('cron(0 14 ? * WED *)'),
    });

    // Pass weekId: "auto" so the Lambda computes the current ISO week at invocation time
    weeklyEmailSendRule.addTarget(
      new eventsTargets.LambdaFunction(sendWeeklyEmailHandler, {
        event: events.RuleTargetInput.fromObject({
          weekId: 'auto',
        }),
      }),
    );

    // =========================================================================
    // SNS — SES Event Notifications (Bounces & Complaints)
    // =========================================================================

    const sesEventsTopic = new sns.Topic(this, 'SesEventsTopic', {
      topicName: 'frc-ses-events',
      displayName: 'FRC SES Bounce & Complaint Notifications',
    });

    // =========================================================================
    // Lambda — SES Event Handler (Bounces & Complaints)
    // =========================================================================

    const sesEventHandler = new lambdaNodejs.NodejsFunction(this, 'SesEventHandler', {
      functionName: 'frc-ses-event-handler',
      entry: path.join(__dirname, '..', 'lambda', 'ses-events', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        SUBSCRIBERS_TABLE: subscribersTable.tableName,
        EMAIL_EVENTS_TABLE: emailEventsTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],  // available in Lambda runtime
      },
    });

    // Grant DynamoDB permissions
    subscribersTable.grantReadWriteData(sesEventHandler);
    emailEventsTable.grantReadWriteData(sesEventHandler);

    // Subscribe the Lambda to the SNS topic
    sesEventsTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(sesEventHandler),
    );

    // =========================================================================
    // SES — Configuration Set & Event Destination (Bounces/Complaints -> SNS)
    // =========================================================================

    // Create an SES configuration set for tracking bounce/complaint events
    const sesConfigSet = new ses.ConfigurationSet(this, 'SesConfigurationSet', {
      configurationSetName: 'frc-ses-config',
    });

    // Event destination: route all engagement events to the SNS topic
    new ses.ConfigurationSetEventDestination(this, 'SesEventDestination', {
      configurationSet: sesConfigSet,
      destination: ses.EventDestination.snsTopic(sesEventsTopic),
      events: [
        ses.EmailSendingEvent.BOUNCE,
        ses.EmailSendingEvent.COMPLAINT,
        ses.EmailSendingEvent.OPEN,
        ses.EmailSendingEvent.CLICK,
        ses.EmailSendingEvent.SEND,
        ses.EmailSendingEvent.DELIVERY,
        ses.EmailSendingEvent.REJECT,
      ],
    });

    // =========================================================================
    // CloudWatch — Monitoring Dashboard & Alarms
    // =========================================================================

    // SNS topic for alarm notifications (admin email)
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'frc-alarms',
      displayName: 'FRC CloudWatch Alarm Notifications',
    });
    alarmTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('kgmodi@gmail.com'),
    );

    // --- Alarms ---

    // 1. Generate content Lambda errors
    const generateErrorAlarm = new cloudwatch.Alarm(this, 'GenerateContentErrorAlarm', {
      alarmName: 'frc-generate-content-errors',
      alarmDescription: 'Content generation Lambda errors (>0 in 1 hour)',
      metric: generateContentHandler.metricErrors({ period: Duration.hours(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    generateErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // 2. Send weekly email Lambda errors
    const sendEmailErrorAlarm = new cloudwatch.Alarm(this, 'SendWeeklyEmailErrorAlarm', {
      alarmName: 'frc-send-weekly-email-errors',
      alarmDescription: 'Weekly email send Lambda errors (>0 in 1 hour)',
      metric: sendWeeklyEmailHandler.metricErrors({ period: Duration.hours(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    sendEmailErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // 3. SES bounce rate alarm (>5% over 1 hour)
    const sesBounceAlarm = new cloudwatch.Alarm(this, 'SesBounceRateAlarm', {
      alarmName: 'frc-ses-bounce-rate-high',
      alarmDescription: 'SES bounce rate exceeds 5%',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SES',
        metricName: 'Reputation.BounceRate',
        period: Duration.hours(1),
        statistic: 'Average',
      }),
      threshold: 0.05,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    sesBounceAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // 4. SES complaint rate alarm (>0.1% over 1 hour)
    const sesComplaintAlarm = new cloudwatch.Alarm(this, 'SesComplaintRateAlarm', {
      alarmName: 'frc-ses-complaint-rate-high',
      alarmDescription: 'SES complaint rate exceeds 0.1%',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SES',
        metricName: 'Reputation.ComplaintRate',
        period: Duration.hours(1),
        statistic: 'Average',
      }),
      threshold: 0.001,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    sesComplaintAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // --- CloudWatch Dashboard ---

    const dashboard = new cloudwatch.Dashboard(this, 'FrcDashboard', {
      dashboardName: 'FreeReverseColoring',
    });

    // Row 1: Lambda invocations and errors
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Content Generation',
        left: [
          generateContentHandler.metricInvocations({ period: Duration.hours(1) }),
          generateContentHandler.metricErrors({ period: Duration.hours(1) }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Weekly Email Send',
        left: [
          sendWeeklyEmailHandler.metricInvocations({ period: Duration.hours(1) }),
          sendWeeklyEmailHandler.metricErrors({ period: Duration.hours(1) }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Subscribe/Unsubscribe API',
        left: [
          subscribeHandler.metricInvocations({ period: Duration.hours(1) }),
          confirmHandler.metricInvocations({ period: Duration.hours(1) }),
          unsubscribeHandler.metricInvocations({ period: Duration.hours(1) }),
        ],
        width: 8,
      }),
    );

    // Row 2: SES metrics and Lambda duration
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'SES Delivery Metrics',
        left: [
          new cloudwatch.Metric({ namespace: 'AWS/SES', metricName: 'Send', period: Duration.hours(1), statistic: 'Sum' }),
          new cloudwatch.Metric({ namespace: 'AWS/SES', metricName: 'Delivery', period: Duration.hours(1), statistic: 'Sum' }),
          new cloudwatch.Metric({ namespace: 'AWS/SES', metricName: 'Bounce', period: Duration.hours(1), statistic: 'Sum' }),
          new cloudwatch.Metric({ namespace: 'AWS/SES', metricName: 'Complaint', period: Duration.hours(1), statistic: 'Sum' }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration (p99)',
        left: [
          generateContentHandler.metricDuration({ period: Duration.hours(1), statistic: 'p99' }),
          sendWeeklyEmailHandler.metricDuration({ period: Duration.hours(1), statistic: 'p99' }),
          subscribeHandler.metricDuration({ period: Duration.hours(1), statistic: 'p99' }),
        ],
        width: 12,
      }),
    );

    // Row 3: API Gateway and DynamoDB
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Requests',
        left: [
          new cloudwatch.Metric({ namespace: 'AWS/ApiGateway', metricName: 'Count', period: Duration.hours(1), statistic: 'Sum', dimensionsMap: { ApiName: 'frc-api' } }),
          new cloudwatch.Metric({ namespace: 'AWS/ApiGateway', metricName: '4XXError', period: Duration.hours(1), statistic: 'Sum', dimensionsMap: { ApiName: 'frc-api' } }),
          new cloudwatch.Metric({ namespace: 'AWS/ApiGateway', metricName: '5XXError', period: Duration.hours(1), statistic: 'Sum', dimensionsMap: { ApiName: 'frc-api' } }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Consumed Capacity',
        left: [
          new cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ConsumedReadCapacityUnits', period: Duration.hours(1), statistic: 'Sum', dimensionsMap: { TableName: 'frc-subscribers' } }),
          new cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ConsumedWriteCapacityUnits', period: Duration.hours(1), statistic: 'Sum', dimensionsMap: { TableName: 'frc-subscribers' } }),
          new cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ConsumedReadCapacityUnits', period: Duration.hours(1), statistic: 'Sum', dimensionsMap: { TableName: 'frc-designs' } }),
        ],
        width: 12,
      }),
    );

    // =========================================================================
    // DynamoDB — Custom Generations Table (rate-limited user generations)
    // =========================================================================

    const customGenerationsTable = new dynamodb.Table(this, 'CustomGenerationsTable', {
      tableName: 'frc-custom-generations',
      partitionKey: { name: 'generationId', type: dynamodb.AttributeType.STRING },
      // No sort key — generationId is globally unique (UUID-based).
      // Each partition has exactly one item, so a sort key adds no value.
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI for rate-limit queries: how many generations has this email done this month?
    customGenerationsTable.addGlobalSecondaryIndex({
      indexName: 'EmailMonthIndex',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'monthKey', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    // =========================================================================
    // DynamoDB — Email Verifications Table (OTP verification for custom generator)
    // =========================================================================

    const emailVerificationsTable = new dynamodb.Table(this, 'EmailVerificationsTable', {
      tableName: 'frc-email-verifications',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // =========================================================================
    // Lambda — Email Verification Handler (OTP send + verify)
    // =========================================================================

    const verifyEmailHandler = new lambdaNodejs.NodejsFunction(this, 'VerifyEmailHandler', {
      functionName: 'frc-verify-email-handler',
      description: 'Email verification via OTP — send code and verify code endpoints',
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '..', 'lambda', 'verify-email', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        VERIFICATIONS_TABLE: emailVerificationsTable.tableName,
        SES_FROM_EMAIL: 'noreply@freereversecoloring.com',
        SITE_URL: 'https://freereversecoloring.com',
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Grant DynamoDB permissions: read + write verification records
    emailVerificationsTable.grantReadWriteData(verifyEmailHandler);

    // Grant SES permission for sending verification emails
    verifyEmailHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      }),
    );

    // =========================================================================
    // Lambda — Custom Reverse Coloring Page Generator
    // =========================================================================

    // ---- Processor Lambda (async — does the actual OpenAI generation) ----

    const customGenerateProcessor = new lambdaNodejs.NodejsFunction(this, 'CustomGenerateProcessor', {
      functionName: 'frc-custom-generate-processor',
      description: 'Async processor for custom reverse coloring page generation (GPT-4o + gpt-image-1)',
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '..', 'lambda', 'custom-generate', 'processor.ts'),
      handler: 'handler',
      timeout: Duration.minutes(5),
      memorySize: 1024,
      environment: {
        CUSTOM_GENERATIONS_TABLE: customGenerationsTable.tableName,
        CONTENT_BUCKET: contentBucket.bucketName,
        OPENAI_SECRET_ARN: openaiApiKeySecret.secretArn,
        MAX_FREE_PER_MONTH: '2',
        SES_FROM_EMAIL: 'noreply@freereversecoloring.com',
        SITE_URL: 'https://freereversecoloring.com',
      },
      bundling: {
        minify: false,
        sourceMap: true,
        // Do NOT externalize AWS SDK — bundle everything including
        // @aws-sdk/s3-request-presigner which is not in the Lambda runtime.
      },
    });

    // Processor needs: DynamoDB read/write, S3 write, Secrets Manager read
    customGenerationsTable.grantReadWriteData(customGenerateProcessor);
    contentBucket.grantReadWrite(customGenerateProcessor);
    openaiApiKeySecret.grantRead(customGenerateProcessor);

    // Grant SES permission for sending generation notification emails
    customGenerateProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      }),
    );

    // ---- Initiator + Status Lambda (handles POST and GET via API Gateway) ----

    const customGenerateHandler = new lambdaNodejs.NodejsFunction(this, 'CustomGenerateHandler', {
      functionName: 'frc-custom-generate-handler',
      description: 'Custom generator initiator (POST) + status poller (GET) — returns immediately, delegates to processor',
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '..', 'lambda', 'custom-generate', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(29),
      memorySize: 512,
      environment: {
        CUSTOM_GENERATIONS_TABLE: customGenerationsTable.tableName,
        CONTENT_BUCKET: contentBucket.bucketName,
        MAX_FREE_PER_MONTH: '2',
        PROCESSOR_FUNCTION_NAME: customGenerateProcessor.functionName,
      },
      bundling: {
        minify: false,
        sourceMap: true,
        // Do NOT externalize AWS SDK — bundle everything including
        // @aws-sdk/s3-request-presigner which is not in the Lambda runtime.
      },
    });

    // Initiator needs: DynamoDB read/write, S3 read (presigned URLs), invoke processor
    customGenerationsTable.grantReadWriteData(customGenerateHandler);
    contentBucket.grantRead(customGenerateHandler);
    customGenerateProcessor.grantInvoke(customGenerateHandler);

    // Wire up POST /api/custom-generate (initiate generation)
    const customGenerateResource = apiResource.addResource('custom-generate');
    customGenerateResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(customGenerateHandler),
    );

    // Wire up GET /api/custom-generate/{generationId} (poll status)
    const customGenerateStatusResource = customGenerateResource.addResource('{generationId}');
    customGenerateStatusResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(customGenerateHandler),
    );

    // Wire up POST /api/verify-email (send OTP)
    const verifyEmailResource = apiResource.addResource('verify-email');
    verifyEmailResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(verifyEmailHandler),
    );

    // Wire up POST /api/verify-code (verify OTP)
    const verifyCodeResource = apiResource.addResource('verify-code');
    verifyCodeResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(verifyEmailHandler),
    );

    // CloudWatch alarm for custom generation errors (initiator)
    const customGenerateErrorAlarm = new cloudwatch.Alarm(this, 'CustomGenerateErrorAlarm', {
      alarmName: 'frc-custom-generate-errors',
      alarmDescription: 'Custom page generation Lambda errors (>0 in 1 hour)',
      metric: customGenerateHandler.metricErrors({ period: Duration.hours(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    customGenerateErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // CloudWatch alarm for custom generation processor errors
    const customProcessorErrorAlarm = new cloudwatch.Alarm(this, 'CustomProcessorErrorAlarm', {
      alarmName: 'frc-custom-generate-processor-errors',
      alarmDescription: 'Custom page generation processor Lambda errors (>0 in 1 hour)',
      metric: customGenerateProcessor.metricErrors({ period: Duration.hours(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    customProcessorErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // Add custom generation metrics to the dashboard
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Custom Generator (Initiator + Status)',
        left: [
          customGenerateHandler.metricInvocations({ period: Duration.hours(1) }),
          customGenerateHandler.metricErrors({ period: Duration.hours(1) }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Custom Generator (Processor)',
        left: [
          customGenerateProcessor.metricInvocations({ period: Duration.hours(1) }),
          customGenerateProcessor.metricErrors({ period: Duration.hours(1) }),
          customGenerateProcessor.metricDuration({ period: Duration.hours(1), statistic: 'p99' }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Custom Generator DynamoDB',
        left: [
          new cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ConsumedReadCapacityUnits', period: Duration.hours(1), statistic: 'Sum', dimensionsMap: { TableName: 'frc-custom-generations' } }),
          new cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ConsumedWriteCapacityUnits', period: Duration.hours(1), statistic: 'Sum', dimensionsMap: { TableName: 'frc-custom-generations' } }),
        ],
        width: 8,
      }),
    );

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

