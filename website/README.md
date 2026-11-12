# AWS User Group Mississauga website

The community website, plus the AWS infrastructure that hosts it.

```
site/            The website: index.html, content.json (organizers, events, sponsors) and assets/
infra/           AWS CDK app (TypeScript) that hosts the site
docs/            Planning documents (not deployed)
.github/         GitHub Actions workflow that deploys on every push to main
```

## Updating content

Organizers, speakers, events and sponsors live in **`site/content.json`**. You don't need to touch any code to change them.

### Edit on GitHub (no setup needed)

1. Open `site/content.json` in the GitHub repo and click the pencil icon (**Edit this file**).
2. Make your change. Copy an existing entry and change its values to add a new one.
3. Click **Commit changes**. Choose **Create a new branch and start a pull request** so a second organizer can check it.
4. The pull request check tells you if anything is wrong, such as a missing comma or a badly formatted date. Once it's merged, the site updates within a few minutes.

### Rules that keep the file valid

- Every entry is in `{ }` and entries are separated by commas. There's **no comma after the last entry** in a list.
- Text goes in double quotes: `"name": "Priya Sharma"`.
- Dates are `YYYY-MM-DD`, for example `"2026-11-18"`.
- `level` is a number without quotes: `100`, `200` or `300`.
- Links start with `https://`.
- Photos and logos go in `site/assets/` and are written as `"assets/people/priya.jpg"`, or as a full `https://` link.

### What each section takes

| Section | Fields |
|---|---|
| `organizers` | `name`, `role`, `photo` (optional), `linkedin` (optional) |
| `speakers` | `name`, `label` (e.g. "Past speaker · Oct 2026"), `talk`, `photo`, `linkedin` |
| `events` | `id` (short, no spaces), `date`, `time`, `title`, `level`, `tags`, `summary`, `venue`, `speaker`, `rsvp`, `learn`, `agenda`, `prerequisites`, `access`. Past events can add `materials` with `recording`, `slides`, `photos`, `code` and `feedback` links. |
| `sponsors` | `name`, `logo` (optional), `url` (optional). While the list is empty, the site shows "Your logo" placeholders. |

Events sort themselves. Upcoming ones appear under **Upcoming meetups**, and the first one becomes the **Next meetup** card on the home page. Once an event's date passes, it moves to **Latest meetup** automatically.

Example: adding an organizer.

```json
"organizers": [
  { "name": "Organizer name", "role": "Group lead", "photo": "", "linkedin": "" },
  { "name": "Priya Sharma", "role": "Co-organizer · Sponsors", "photo": "assets/people/priya.jpg", "linkedin": "https://www.linkedin.com/in/example" }
],
```

### Previewing your changes

Browsers don't let a page read `content.json` when you double-click `index.html` on your computer, so the page then shows its built-in copy of the content. To preview the real thing locally, run a small web server from the project folder:

```bash
npx serve site
```

Then open the address it prints.

## Editing the website

Edit `site/index.html` and push to `main`. GitHub Actions checks the change and deploys it, usually within a few minutes.

`site/index.html` deliberately has no `<!doctype>`, `<html>`, `<head>` or `<body>` tags, so it can also be previewed as a Claude artifact. The deploy adds those tags automatically (see `infra/lib/site-build.ts`). Don't add them by hand.

## What Phase 0 sets up

| Stack | Region | What it creates |
|---|---|---|
| `AwsMississaugaHosting` | ca-central-1 | Private S3 bucket (encrypted, versioned), CloudFront with HTTPS and security headers, automatic upload of `site/`, optional custom domain |
| `AwsMississaugaForms` | ca-central-1 | Form API (`POST /api/submit`), a Lambda that checks each submission, saves it in DynamoDB and emails it to you through SES |
| `AwsMississaugaBudget` | us-east-1 | Monthly cost budget that emails you at 80% of the limit, and when the forecast goes over |
| `AwsMississaugaGitHubDeploy` | ca-central-1 | GitHub OIDC trust and a deploy role, so GitHub Actions deploys without stored AWS keys |

The forms, budget and GitHub stacks are only created once their settings are filled in (step 3).

## First-time setup

You need an AWS account, Node.js 20 or newer, and someone with admin access for the first deploy. After that, GitHub Actions does the deploys.

### 1. Install the AWS CLI and sign in

Install the [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), then sign in. With IAM Identity Center (recommended, one login per volunteer):

```bash
aws configure sso
```

Check that it worked:

```bash
aws sts get-caller-identity
```

### 2. Install the CDK project

```bash
cd infra
npm install
```

### 3. Fill in the settings

Open `infra/cdk.json` and fill in the `context` values. Leave a value as `""` to skip it for now.

| Setting | Example | Needed for |
|---|---|---|
| `alertEmail` | `organizers@example.com` | Budget alerts |
| `formsEmail` | `organizers@example.com` | Where form submissions are emailed. Separate several with commas. Leave empty to keep the forms in preview mode |
| `formsFromEmail` | `website@example.com` | Optional. The address the emails come from. Defaults to the first `formsEmail` |
| `formsKeepDays` | `"365"` | How long submissions are kept before they're deleted automatically |
| `monthlyBudgetUsd` | `"20"` | Budget limit in US dollars |
| `githubRepo` | `your-org/aws-mississauga-website` | Deploys from GitHub |
| `githubOidcProviderArn` | | Only if the account already has a GitHub OIDC provider |
| `domainName` | `www.example.com` | Custom domain (step 6) |
| `certificateArn` | `arn:aws:acm:us-east-1:...` | Custom domain (step 6) |
| `hostedZoneId`, `hostedZoneName` | `Z0123...`, `example.com` | Automatic DNS records if the domain is in Route 53 |

### 4. Bootstrap and deploy

Bootstrapping prepares the account for CDK. It's needed once per region. Replace `123456789012` with your account ID from step 1.

```bash
npx cdk bootstrap aws://123456789012/ca-central-1 aws://123456789012/us-east-1
```

```bash
npx cdk deploy --all
```

When it finishes, open the `SiteUrl` output. That's the live website.

If you set `formsEmail`, AWS sends a verification email to each address. **Click the link in it**, or no form emails will arrive. See "Website forms" below.

### 5. Turn on deploys from GitHub

1. Push this folder to the GitHub repo you named in `githubRepo`.
2. Copy the `DeployRoleArn` output from step 4.
3. In GitHub, go to **Settings → Secrets and variables → Actions → Variables** and add `AWS_DEPLOY_ROLE_ARN` with that value.
4. Optional: under **Settings → Environments → production**, add required reviewers so someone approves each deploy.

From now on, every push to `main` that changes `site/` or `infra/` deploys automatically. Pull requests are type-checked but never deployed.

### 6. Custom domain (when the domain is chosen)

1. In the AWS console, switch to **us-east-1** and request a public certificate in **Certificate Manager** for your domain, using DNS validation. CloudFront only accepts certificates from us-east-1.
2. Put `domainName` and `certificateArn` in `infra/cdk.json`. If the domain's DNS is in Route 53, also add `hostedZoneId` and `hostedZoneName`. Otherwise, point a CNAME at the `CloudFrontDomain` output with your DNS provider.
3. Push to `main`, or run `npx cdk deploy AwsMississaugaHosting`.

## Website forms

The site has four forms: speaker, sponsor, volunteer and newsletter. There are two ways to have them emailed to you.

### Option 1: Web3Forms (free, no AWS account needed)

1. Go to web3forms.com, enter the email that should receive the forms, and copy the access key they email you. Use a key just for the user group.
2. In `site/index.html`, find `const WEB3FORMS_KEY = '';` and paste the key between the quotes.
3. Publish the site. Each submission arrives as an email titled like "New speaker application: Priya Sharma". Hit Reply to answer the person.

The key is meant to be public, so it's fine in the page. The free plan covers about 250 submissions a month. If the AWS forms API below is deployed, it takes over and the key is ignored.

### Option 2: the AWS forms API

All four forms post to one endpoint, `/api/submit`, on the site's own domain. CloudFront passes those requests to API Gateway, so there's no CORS to set up.

For each submission, the Lambda (`infra/lambda/forms/index.mjs`):

1. Ignores it if the hidden `website` field is filled in. Only bots fill it in.
2. Checks the fields against that form's list. Unknown fields are dropped, and too-long text and invalid options are rejected.
3. Saves it in the `Submissions` DynamoDB table, which deletes it automatically after `formsKeepDays`.
4. Emails it to `formsEmail` as plain text. Reply-To is the visitor's address, so you can just hit Reply.

API Gateway allows about 2 submissions a second (bursts of 10), so a bot can't flood your inbox.

**Turning the forms on**

1. Put your address in `formsEmail` in `infra/cdk.json` and deploy.
2. Click the verification link AWS emails you.
3. New AWS accounts are in the **SES sandbox**: SES only sends to verified addresses. That's fine while emails only go to you. To send to unverified addresses later, such as newsletter confirmations, request production access in the SES console (ca-central-1).

Until `formsEmail` is set, the forms only check the fields and say "Preview only". That's also what happens when you open `index.html` locally or as a Claude artifact.

**If an email doesn't arrive**, check your spam folder, then the Lambda's logs in CloudWatch (`AwsMississaugaForms`). Every submission is also in the DynamoDB table, so nothing is lost if an email fails.

## Useful commands

Run these from `infra/`:

```bash
npm run build
```

Type-checks the CDK code.

```bash
npx cdk diff
```

Shows what a deploy would change.

```bash
npx cdk synth
```

Generates the CloudFormation templates without deploying.

## Notes

- All website data stays in Canada (ca-central-1). The budget lives in us-east-1 because AWS billing settings are account-wide.
- The S3 bucket is kept if the stack is deleted, so the site files are never lost by accident.
- Form submissions are stored in Canada (ca-central-1). The table is kept if the stack is deleted.
