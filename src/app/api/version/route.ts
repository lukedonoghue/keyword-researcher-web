import { NextResponse } from 'next/server';
import packageJson from '../../../../package.json';

export async function GET() {
  const appVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
  const commitSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7);
  const build = commitSha ? `v${appVersion}-${commitSha}` : `v${appVersion}`;

  return NextResponse.json(
    { version: appVersion, commitSha, build },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
