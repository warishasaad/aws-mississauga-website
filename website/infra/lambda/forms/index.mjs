// Receives the website's four forms (POST /api/submit), saves each submission and emails the organizers.
// Runs on Node.js 22 in Lambda, where the AWS SDK v3 is already installed.
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'node:crypto';

const ses = new SESv2Client({});
const db = new DynamoDBClient({});

const MAX_BODY = 10_000;
const KEEP_DAYS = Number(process.env.KEEP_DAYS || 365);

// What each form may send. Anything not listed here is ignored.
// text: max length (one line unless multiline); one: one of the values; many: a list of the values.
export const FORMS = {
  speaker: {
    title: 'New speaker application',
    fields: {
      name: { label: 'Name', text: 120, required: true },
      email: { label: 'Email', email: true, required: true },
      profession: { label: 'Profession', text: 120 },
      company: { label: 'Company', text: 120 },
      skills: { label: 'Skill sets', text: 300 },
      topics: { label: 'Proposed topics', text: 3000, multiline: true, required: true },
      availability: { label: 'Availability', text: 300 },
    },
  },
  sponsor: {
    title: 'New sponsor inquiry',
    fields: {
      company: { label: 'Company', text: 120, required: true },
      name: { label: 'Contact name', text: 120, required: true },
      email: { label: 'Email', email: true, required: true },
      support: { label: 'How they want to help', many: ['venue', 'food', 'workshop', 'community'], required: true },
      message: { label: 'Message', text: 3000, multiline: true },
    },
  },
  volunteer: {
    title: 'New volunteer',
    fields: {
      name: { label: 'Full name', text: 120, required: true },
      email: { label: 'Email', email: true, required: true },
      availability: { label: 'Availability', many: ['weekday-day', 'evenings', 'weekends', 'flexible'] },
      slots: { label: 'Preferred days or time slots', text: 300 },
      interests: { label: 'Interests', many: ['technical', 'logistics', 'greeting', 'venue', 'sponsorships', 'social', 'photo', 'content'], required: true },
      skills: { label: 'Skill sets', text: 300 },
      experience: { label: 'Experience', one: ['beginner', 'intermediate', 'advanced'] },
      commitment: { label: 'Commitment', one: ['one-time', 'occasional', 'ongoing'] },
      notes: { label: 'Notes', text: 3000, multiline: true },
    },
  },
  newsletter: {
    title: 'New newsletter sign-up',
    fields: {
      name: { label: 'Name', text: 120, required: true },
      email: { label: 'Email', email: true, required: true },
    },
  },
};

const EMAIL = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,}$/i;

/** Returns { form, values } or { error } with a message the visitor can act on. */
export function validate(body) {
  const spec = FORMS[body?.form];
  if (!spec) return { error: 'Unknown form.' };
  if (body.consent !== true) return { error: 'Please tick the consent box to continue.' };

  const values = {};
  for (const [key, f] of Object.entries(spec.fields)) {
    let v = body[key];
    if (f.many) {
      v = (Array.isArray(v) ? v : []).filter(x => f.many.includes(x));
      if (f.required && !v.length) return { error: `Please choose at least one option for "${f.label}".` };
      if (v.length) values[key] = [...new Set(v)];
      continue;
    }
    v = typeof v === 'string' ? v.trim() : '';
    if (!f.multiline) v = v.replace(/\s+/g, ' ');
    if (!v) {
      if (f.required) return { error: 'Please fill in the required fields marked *.' };
      continue;
    }
    if (f.email && (v.length > 254 || !EMAIL.test(v))) return { error: 'Please enter a valid email address.' };
    if (f.one && !f.one.includes(v)) return { error: `Please choose a valid option for "${f.label}".` };
    if (f.text && v.length > f.text) return { error: `"${f.label}" is too long (${f.text} characters at most).` };
    values[key] = v;
  }
  return { form: body.form, values };
}

/** Plain-text email, so nothing a visitor types can turn into links or markup. */
export function emailText(form, values, id) {
  const spec = FORMS[form];
  const lines = Object.entries(spec.fields)
    .filter(([key]) => values[key] !== undefined)
    .map(([key, f]) => {
      const v = Array.isArray(values[key]) ? values[key].join(', ') : values[key];
      return f.multiline ? `\n${f.label}:\n${v}\n` : `${f.label}: ${v}`;
    });
  return [
    `${spec.title} from the AWS User Group Mississauga website.`,
    '',
    ...lines,
    '',
    `Reply to this email to answer them directly. Reference: ${id}`,
  ].join('\n');
}

const reply = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

export async function handler(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  if (raw.length > MAX_BODY) return reply(413, { error: 'That submission is too long.' });

  let body;
  try { body = JSON.parse(raw); } catch { return reply(400, { error: 'Something went wrong. Please try again.' }); }

  // Hidden "website" field: people never see it, bots fill it in. Pretend it worked.
  if (typeof body.website === 'string' && body.website.trim()) return reply(200, { ok: true });

  const result = validate(body);
  if (result.error) return reply(400, { error: result.error });
  const { form, values } = result;

  const id = randomUUID();
  const now = new Date();
  const item = {
    id: { S: id },
    form: { S: form },
    submittedAt: { S: now.toISOString() },
    data: { S: JSON.stringify(values) },
    expiresAt: { N: String(Math.floor(now.getTime() / 1000) + KEEP_DAYS * 86400) },
  };

  try {
    await db.send(new PutItemCommand({ TableName: process.env.TABLE_NAME, Item: item }));
    // Names and newlines are stripped from the subject so they can't break the email headers.
    const who = (values.company && form === 'sponsor' ? values.company : values.name).replace(/[\r\n]+/g, ' ').slice(0, 80);
    await ses.send(new SendEmailCommand({
      FromEmailAddress: process.env.FROM_EMAIL,
      Destination: { ToAddresses: process.env.TO_EMAIL.split(',').map(s => s.trim()).filter(Boolean) },
      ReplyToAddresses: [values.email],
      Content: {
        Simple: {
          Subject: { Data: `${FORMS[form].title}: ${who}`, Charset: 'UTF-8' },
          Body: { Text: { Data: emailText(form, values, id), Charset: 'UTF-8' } },
        },
      },
    }));
  } catch (err) {
    console.error(JSON.stringify({ msg: 'submission failed', id, form, error: err.name, detail: err.message }));
    return reply(502, { error: 'We couldn\'t send that just now. Please try again in a few minutes.' });
  }

  console.log(JSON.stringify({ msg: 'submission received', id, form }));
  return reply(200, { ok: true });
}
