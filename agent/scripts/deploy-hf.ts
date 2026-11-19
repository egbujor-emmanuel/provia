// Deploys the agent to a Hugging Face Docker Space by committing only the files it needs.
// Run from repo root: node --env-file=.env agent/scripts/deploy-hf.ts
// Needs HF_TOKEN (write) and HF_USERNAME. Secrets are NOT uploaded: add them in the Space settings.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createRepo, repoExists, uploadFiles } from '@huggingface/hub';

const token = process.env.HF_TOKEN;
const user = process.env.HF_USERNAME;
if (!token || !user) throw new Error('HF_TOKEN and HF_USERNAME must be set in .env');

const space = { type: 'space' as const, name: `${user}/provia-agent` };
const receiptsRepo = `${user}/provia-receipts`;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const posix = (p: string) => p.split(sep).join('/');
const files: { path: string; content: Blob }[] = [];
const add = (local: string, remote = posix(local)) => files.push({ path: remote, content: new Blob([readFileSync(local)]) });

// The receipts repo name depends on the account, so it is baked into the image as plain config.
const dockerfile = readFileSync('deploy/hf/Dockerfile', 'utf8').replace(
  'ZKTLS_MODE=tee',
  `ZKTLS_MODE=tee HF_RECEIPTS_REPO=${receiptsRepo}`,
);
files.push({ path: 'Dockerfile', content: new Blob([dockerfile]) });
add('deploy/hf/README.md', 'README.md');
for (const f of ['package.json', 'package-lock.json', 'agent/package.json', 'circuits/package.json', 'contracts/package.json', 'evidence/deployment-base-sepolia.json']) add(f);
for (const f of walk('agent/src')) add(f);
for (const f of walk('circuits/artifacts')) add(f);

if (!(await repoExists({ repo: space, accessToken: token }))) {
  await createRepo({ repo: space, accessToken: token, sdk: 'docker', private: false });
  process.stdout.write(`created Space ${space.name}\n`);
}
const commit = await uploadFiles({ repo: space, accessToken: token, files, commitTitle: `deploy ${new Date().toISOString()}` });
process.stdout.write(`uploaded ${files.length} files (${files.map((f) => relative('.', f.path)).length}) to ${space.name}: ${JSON.stringify(commit?.commit ?? {})}\n`);
process.stdout.write(`Space: https://huggingface.co/spaces/${space.name}\nApp:   https://${user.toLowerCase()}-provia-agent.hf.space\n`);
