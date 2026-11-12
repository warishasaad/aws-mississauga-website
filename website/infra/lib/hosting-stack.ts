import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { buildIndexHtml, validateContent } from './site-build';

export interface HostingStackProps extends StackProps {
  /** Folder holding index.html and assets/. */
  siteDir: string;
  /** Custom domain, e.g. www.example.com. Needs certificateArn too. */
  domainName?: string;
  /** ACM certificate for domainName. CloudFront requires it to be in us-east-1. */
  certificateArn?: string;
  /** Route 53 zone to create the domain's alias records in. Optional: without it, add a DNS record yourself. */
  hostedZone?: { id: string; name: string };
  /** API Gateway domain from FormsStack. When set, /api/* goes there and the site's forms send for real. */
  formsApiDomain?: string;
}

/** Private S3 bucket served only through CloudFront over HTTPS. */
export class HostingStack extends Stack {
  constructor(scope: Construct, id: string, props: HostingStackProps) {
    super(scope, id, props);

    validateContent(props.siteDir);

    if (props.domainName && !props.certificateArn) {
      throw new Error('domainName is set but certificateArn is empty. Request a certificate in us-east-1 first (see README).');
    }

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],
    });

    const certificate = props.certificateArn
      ? acm.Certificate.fromCertificateArn(this, 'SiteCertificate', props.certificateArn)
      : undefined;

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      comment: 'AWS User Group Mississauga website',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true,
      },
      // Forms post to /api/submit on the site's own domain, so no cross-site (CORS) setup is needed.
      additionalBehaviors: props.formsApiDomain ? {
        '/api/*': {
          origin: new origins.HttpOrigin(props.formsApiDomain),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        },
      } : undefined,
      domainNames: props.domainName ? [props.domainName] : undefined,
      certificate,
      // Only applies with a custom certificate; the default *.cloudfront.net certificate has a fixed policy.
      minimumProtocolVersion: certificate ? cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021 : undefined,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // North America and Europe edge locations: the cheapest tier, and where our visitors are.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      // One-page site: send unknown paths back to the home page.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/index.html', ttl: Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/index.html', ttl: Duration.minutes(5) },
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      destinationBucket: bucket,
      sources: [
        s3deploy.Source.asset(props.siteDir, { exclude: ['index.html', '.DS_Store'] }),
        s3deploy.Source.data('index.html', buildIndexHtml(props.siteDir, { formsEndpoint: props.formsApiDomain ? '/api/submit' : undefined })),
      ],
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=300')],
      prune: true,
      distribution,
      distributionPaths: ['/*'],
      memoryLimit: 512,
    });

    if (props.domainName && props.hostedZone) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
        hostedZoneId: props.hostedZone.id,
        zoneName: props.hostedZone.name,
      });
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
      new route53.ARecord(this, 'SiteAliasA', { zone, recordName: props.domainName, target });
      new route53.AaaaRecord(this, 'SiteAliasAAAA', { zone, recordName: props.domainName, target });
    }

    new CfnOutput(this, 'SiteUrl', {
      value: `https://${props.domainName ?? distribution.distributionDomainName}`,
      description: 'Open this to see the live website',
    });
    new CfnOutput(this, 'CloudFrontDomain', {
      value: distribution.distributionDomainName,
      description: 'Point your DNS record here if you are not using Route 53',
    });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
