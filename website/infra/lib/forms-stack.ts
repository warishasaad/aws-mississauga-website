import * as path from 'path';
import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ses from 'aws-cdk-lib/aws-ses';

export interface FormsStackProps extends StackProps {
  /** Where form submissions are emailed. Several addresses can be separated by commas. */
  toEmail: string;
  /** The address the emails come from. Must be verified in SES; defaults to the first toEmail. */
  fromEmail?: string;
  /** How long submissions are kept in the table before they're deleted automatically. */
  keepDays: number;
}

/**
 * One endpoint, POST /api/submit, for all four website forms. Each submission is saved in
 * DynamoDB and emailed to the organizers through SES. CloudFront serves it under the site's
 * own domain (see HostingStack), so the browser never makes a cross-site request.
 */
export class FormsStack extends Stack {
  /** e.g. abc123.execute-api.ca-central-1.amazonaws.com, for CloudFront to forward /api/* to. */
  readonly apiDomain: string;

  constructor(scope: Construct, id: string, props: FormsStackProps) {
    super(scope, id, props);

    const toEmails = props.toEmail.split(',').map(s => s.trim()).filter(Boolean);
    const fromEmail = props.fromEmail ?? toEmails[0];

    // Creating these sends a verification email to each address. Until it's clicked, SES won't send.
    // While the account is in the SES sandbox, every recipient must be verified too.
    for (const address of new Set([fromEmail, ...toEmails])) {
      new ses.EmailIdentity(this, `Identity-${address.replace(/[^a-zA-Z0-9]/g, '-')}`, {
        identity: ses.Identity.email(address),
      });
    }

    const table = new dynamodb.TableV2(this, 'Submissions', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      timeToLiveAttribute: 'expiresAt',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const fn = new lambda.Function(this, 'SubmitFunction', {
      description: 'Website forms: validate, save and email the organizers',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'forms')),
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: table.tableName,
        TO_EMAIL: toEmails.join(','),
        FROM_EMAIL: fromEmail,
        KEEP_DAYS: String(props.keepDays),
      },
      logGroup: new logs.LogGroup(this, 'SubmitLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    table.grant(fn, 'dynamodb:PutItem');
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: [`arn:${this.partition}:ses:${this.region}:${this.account}:identity/*`],
      conditions: { StringEquals: { 'ses:FromAddress': fromEmail } },
    }));

    const api = new apigw.HttpApi(this, 'FormsApi', {
      description: 'AWS User Group Mississauga website forms',
      createDefaultStage: false,
    });
    // Caps how fast anyone can submit, so a bot can't flood the inbox or run up costs.
    api.addStage('DefaultStage', {
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 2, burstLimit: 10 },
    });
    api.addRoutes({
      path: '/api/submit',
      methods: [apigw.HttpMethod.POST],
      integration: new HttpLambdaIntegration('SubmitIntegration', fn),
    });

    this.apiDomain = Fn.select(2, Fn.split('/', api.apiEndpoint));

    new CfnOutput(this, 'FormsApiEndpoint', { value: `${api.apiEndpoint}/api/submit` });
    new CfnOutput(this, 'SubmissionsTable', { value: table.tableName });
  }
}
