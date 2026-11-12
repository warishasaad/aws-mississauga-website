#!/usr/bin/env node
import * as path from 'path';
import { App, Tags } from 'aws-cdk-lib';
import { FormsStack } from '../lib/forms-stack';
import { HostingStack } from '../lib/hosting-stack';
import { BudgetStack } from '../lib/budget-stack';
import { GitHubDeployStack } from '../lib/github-deploy-stack';

const app = new App();

// Settings live in cdk.json under "context". Empty strings mean "not set yet".
const ctx = (key: string): string | undefined => {
  const value = app.node.tryGetContext(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

const account = process.env.CDK_DEFAULT_ACCOUNT;
// All website data stays in Canada.
const region = 'ca-central-1';

// Website forms. Leave formsEmail empty and the forms stay in preview mode.
const formsEmail = ctx('formsEmail');
const forms = formsEmail
  ? new FormsStack(app, 'AwsMississaugaForms', {
      env: { account, region },
      description: 'AWS User Group Mississauga website: form API, submissions table and email alerts',
      toEmail: formsEmail,
      fromEmail: ctx('formsFromEmail'),
      keepDays: Number(ctx('formsKeepDays') ?? '365'),
    })
  : undefined;

const hostedZoneId = ctx('hostedZoneId');
const hostedZoneName = ctx('hostedZoneName');

new HostingStack(app, 'AwsMississaugaHosting', {
  env: { account, region },
  description: 'AWS User Group Mississauga website: S3 + CloudFront hosting',
  siteDir: path.join(__dirname, '..', '..', 'site'),
  domainName: ctx('domainName'),
  certificateArn: ctx('certificateArn'),
  hostedZone: hostedZoneId && hostedZoneName ? { id: hostedZoneId, name: hostedZoneName } : undefined,
  formsApiDomain: forms?.apiDomain,
});

// AWS Budgets is a global service; the stack lives in us-east-1 alongside other account-wide billing settings.
const alertEmail = ctx('alertEmail');
if (alertEmail) {
  new BudgetStack(app, 'AwsMississaugaBudget', {
    env: { account, region: 'us-east-1' },
    description: 'AWS User Group Mississauga: monthly cost budget and email alerts',
    alertEmail,
    monthlyBudgetUsd: Number(ctx('monthlyBudgetUsd') ?? '20'),
  });
}

const githubRepo = ctx('githubRepo');
if (githubRepo) {
  new GitHubDeployStack(app, 'AwsMississaugaGitHubDeploy', {
    env: { account, region },
    description: 'AWS User Group Mississauga: GitHub Actions deploy role (OIDC, no stored keys)',
    githubRepo,
    existingProviderArn: ctx('githubOidcProviderArn'),
  });
}

Tags.of(app).add('project', 'aws-mississauga-website');
