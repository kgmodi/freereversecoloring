import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { CachePolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { Duration } from 'aws-cdk-lib';
import * as targets from 'aws-cdk-lib/aws-route53-targets';

export class CdkFreeReverseColoringRepoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // cdk resources repo
    const cdkFreeReverseColoringRepo = new codecommit.Repository(this, 'CdkFreeReverseColoringRepo', {
      repositoryName: 'CdkFreeReverseColoringRepo'
    })

    // website repo 
    const freeReverseColoringWebsiteRepo = new codecommit.Repository(this, 'FreeReverseColoringWebsiteRepo', {
      repositoryName: 'FreeReverseColoringWebsiteRepo'

    })

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

    const freeReverseColoringWebsiteDeploymentCodePipeline = new codepipeline.Pipeline(
      this, 'FreeReverseColoringWebsiteDeploymentCodePipeline', {
      crossAccountKeys: false
    });

    const sourceArtifact = new codepipeline.Artifact();
    const sourceStage = freeReverseColoringWebsiteDeploymentCodePipeline.addStage({
      stageName: "Source",
      actions: [
        new codepipeline_actions.CodeCommitSourceAction({
          actionName: 'CodeCommit',
          repository: freeReverseColoringWebsiteRepo,
          output: sourceArtifact,
          branch: 'main'
        })
      ]
    })
    const deployStage = freeReverseColoringWebsiteDeploymentCodePipeline.addStage({
      stageName: "Deploy",
      actions: [
        new codepipeline_actions.S3DeployAction({
          actionName: 'S3Deploy',
          bucket: freeReverseColoringS3Bucket,
          input: sourceArtifact,
          extract: true
        })
      ]
    });

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'zone', {
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

  }

}

