import * as fs from 'fs';
import * as path from 'path';

/**
 * Checks site/content.json before deploying, so a typo fails the pull request with a clear
 * message instead of the live site quietly falling back to old content.
 */
export function validateContent(siteDir: string): void {
  const file = path.join(siteDir, 'content.json');
  let content: any;
  try {
    content = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`site/content.json is not valid JSON. Check for a missing comma, quote or bracket near: ${(err as Error).message}`);
  }

  const problems: string[] = [];
  const needArray = (key: string) => {
    if (content[key] !== undefined && !Array.isArray(content[key])) problems.push(`"${key}" must be a list in [ ] brackets.`);
    return Array.isArray(content[key]) ? content[key] : [];
  };
  const needText = (item: any, field: string, where: string) => {
    if (typeof item?.[field] !== 'string' || !item[field].trim()) problems.push(`${where} is missing "${field}".`);
  };
  const isUrl = (v: unknown) => v === undefined || v === '' || (typeof v === 'string' && /^(https?:\/\/|#)/.test(v));
  const isImage = (v: unknown) => v === undefined || v === '' || (typeof v === 'string' && /^(https:\/\/|assets\/)/.test(v));

  needArray('organizers').forEach((o: any, i: number) => {
    needText(o, 'name', `organizers #${i + 1}`);
    if (!isImage(o.photo)) problems.push(`organizers #${i + 1}: "photo" must start with assets/ or https://`);
    if (!isUrl(o.linkedin)) problems.push(`organizers #${i + 1}: "linkedin" must start with https://`);
  });
  needArray('speakers').forEach((s: any, i: number) => {
    needText(s, 'name', `speakers #${i + 1}`);
    if (!isImage(s.photo)) problems.push(`speakers #${i + 1}: "photo" must start with assets/ or https://`);
  });
  needArray('events').forEach((e: any, i: number) => {
    const where = `events #${i + 1}${e?.title ? ` ("${e.title}")` : ''}`;
    needText(e, 'title', where);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e?.date ?? '') || isNaN(Date.parse(e.date))) problems.push(`${where}: "date" must look like 2026-11-18.`);
    if (e?.level !== undefined && ![100, 200, 300].includes(e.level)) problems.push(`${where}: "level" must be 100, 200 or 300 (no quotes).`);
    if (!isUrl(e?.rsvp)) problems.push(`${where}: "rsvp" must start with https://`);
    for (const k of ['learn', 'agenda', 'tags']) {
      if (e?.[k] !== undefined && !Array.isArray(e[k])) problems.push(`${where}: "${k}" must be a list in [ ] brackets.`);
    }
  });
  needArray('sponsors').forEach((s: any, i: number) => {
    needText(s, 'name', `sponsors #${i + 1}`);
    if (!isImage(s.logo)) problems.push(`sponsors #${i + 1}: "logo" must start with assets/ or https://`);
    if (!isUrl(s.url)) problems.push(`sponsors #${i + 1}: "url" must start with https://`);
  });

  if (problems.length) {
    throw new Error(`site/content.json has ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
  }
}

/**
 * site/index.html is written without <!doctype>, <html>, <head> or <body> so it can also be
 * published as a Claude artifact, which adds that skeleton itself. For real hosting we add it here:
 * everything up to the end of the first <style> block goes in <head>, the rest in <body>.
 */
export function buildIndexHtml(siteDir: string, options: { formsEndpoint?: string } = {}): string {
  const source = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  const marker = '</style>';
  const split = source.indexOf(marker);
  if (split === -1) {
    throw new Error('site/index.html must contain a <style> block near the top.');
  }
  const head = source.slice(0, split + marker.length);
  const body = source.slice(split + marker.length);

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="description" content="AWS User Group Mississauga: free, community-led AWS meetups, labs and AWS Jams across Mississauga and the Western GTA.">',
    '<link rel="icon" type="image/png" href="assets/logo.png">',
    // The page only sends forms when this is present; without it (e.g. a local preview) they stay in preview mode.
    ...(options.formsEndpoint ? [`<meta name="forms-endpoint" content="${options.formsEndpoint}">`] : []),
    head.trim(),
    '</head>',
    '<body>',
    body.trim(),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
