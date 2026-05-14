/**
 * Vercel deployment service.
 *
 * Implements the Vercel REST API "create deployment" flow with inline file
 * contents — small static demo bundles fit comfortably within the inline files
 * limit, so we do not need the upload-by-SHA flow. See:
 *   https://vercel.com/docs/rest-api/endpoints/deployments
 *
 * If VERCEL_API_TOKEN is missing, the service returns a clearly-labelled mock
 * deployment so the workflow is end-to-end runnable in local development.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env, flags } from '../lib/env.js';

export interface VercelDeploymentResult {
  url: string;
  deploymentId: string;
  projectId: string | null;
  mock: boolean;
}

export class VercelDeployError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

interface InlineFile {
  /** Path relative to project root, e.g. "index.html". */
  file: string;
  data: string;
  encoding: 'utf-8' | 'base64';
}

async function readDirectoryAsInlineFiles(dir: string): Promise<InlineFile[]> {
  const out: InlineFile[] = [];
  async function walk(current: string, prefix: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.isFile()) {
        const buf = await fs.readFile(abs);
        // Heuristic: text files are utf-8, anything else base64.
        const ext = path.extname(entry.name).toLowerCase();
        const textExts = ['.html', '.htm', '.css', '.js', '.json', '.md', '.txt', '.svg', '.xml'];
        if (textExts.includes(ext)) {
          out.push({ file: rel, data: buf.toString('utf8'), encoding: 'utf-8' });
        } else {
          out.push({ file: rel, data: buf.toString('base64'), encoding: 'base64' });
        }
      }
    }
  }
  await walk(dir, '');
  return out;
}

function buildProjectName(prefix: string, leadId: string, brandName?: string): string {
  // Vercel project names: lowercase, alphanumeric + hyphens, max 100 chars.
  const brandSlug = (brandName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);
  const parts = [prefix, brandSlug, leadId.slice(0, 8)].filter(Boolean);
  return parts.join('-').slice(0, 100);
}

export async function deleteVercelProject(projectId: string): Promise<void> {
  if (!flags.hasVercel) return;
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}`);
  if (env.VERCEL_TEAM_ID) url.searchParams.set('teamId', env.VERCEL_TEAM_ID);
  const res = await fetch(url.toString(), {
    method: 'DELETE',
    headers: { authorization: `Bearer ${env.VERCEL_API_TOKEN}` },
  });
  // 404 means already gone — treat as success.
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new VercelDeployError(`Vercel project delete failed (${res.status}): ${body.slice(0, 400)}`);
  }
}

export async function deployStaticDirectoryToVercel(opts: {
  leadId: string;
  generatedSiteId: string;
  directory: string;
  brandName?: string;
  vercel: {
    token: string;
    teamId: string | null;
    projectPrefix: string;
  };
}): Promise<VercelDeploymentResult> {
  const files = await readDirectoryAsInlineFiles(opts.directory);
  if (files.length === 0) {
    throw new VercelDeployError(`No files found in ${opts.directory}`);
  }
  const projectName = buildProjectName(opts.vercel.projectPrefix, opts.leadId, opts.brandName);

  const url = new URL('https://api.vercel.com/v13/deployments');
  if (opts.vercel.teamId) url.searchParams.set('teamId', opts.vercel.teamId);

  const body = {
    name: projectName,
    target: 'production',
    files,
    projectSettings: { framework: null as string | null },
  };

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${opts.vercel.token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new VercelDeployError(`Vercel deployment failed (${res.status}): ${errBody.slice(0, 800)}`);
  }
  const json = (await res.json()) as {
    id?: string;
    url?: string;
    projectId?: string;
    alias?: string[];
  };

  if (!json.id || !json.url) {
    throw new VercelDeployError(`Vercel response missing id/url: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return {
    url: json.url.startsWith('http') ? json.url : `https://${json.url}`,
    deploymentId: json.id,
    projectId: json.projectId ?? null,
    mock: false,
  };
}
