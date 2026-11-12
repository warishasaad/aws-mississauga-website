import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface GitHubDeployStackProps extends StackProps {
  /** "owner/repo" on GitHub. */
  githubRepo: string;
  /** Set this if the account already has the GitHub OIDC provider (an account can only have one). */
  existingProviderArn?: string;
}

/**
 * Lets GitHub Actions deploy without stored AWS keys. Only workflow runs in this repo's
 * "production" environment can assume the role, and the role can only hand off to the
 * CDK bootstrap roles, which do the actual deployment.
 */
export class GitHubDeployStack extends Stack {
  constructor(scope: Construct, id: string, props: GitHubDeployStackProps) {
    super(scope, id, props);

    if (!/^[\w.-]+\/[\w.-]+$/.test(props.githubRepo)) {
      throw new Error(`githubRepo must look like "owner/repo", got "${props.githubRepo}".`);
    }

    const provider = props.existingProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GitHubOidc', props.existingProviderArn)
      : new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        });

    const role = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'aws-mississauga-github-deploy',
      description: `GitHub Actions deploys for ${props.githubRepo}`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${props.githubRepo}:environment:production`,
        },
      }),
    });

    role.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*`],
    }));

    new CfnOutput(this, 'DeployRoleArn', {
      value: role.roleArn,
      description: 'Save this as the AWS_DEPLOY_ROLE_ARN variable in the GitHub repo',
    });
  }
}
