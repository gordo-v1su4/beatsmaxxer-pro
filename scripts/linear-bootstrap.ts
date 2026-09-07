#!/usr/bin/env bun
/**
 * Create Beatsmaxxer Pro sprint project + issues in Linear.
 *
 * Usage:
 *   $env:LINEAR_API_KEY = "lin_api_..."   # PowerShell
 *   bun run scripts/linear-bootstrap.ts
 *
 * Optional:
 *   LINEAR_TEAM_KEY=BMX          # default: first team in workspace
 *   LINEAR_PROJECT_NAME=...      # override project title
 */

const API = 'https://api.linear.app/graphql';

type GqlResult<T> = { data?: T; errors?: { message: string }[] };

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const key = process.env.LINEAR_API_KEY;
  if (!key) {
    throw new Error(
      'LINEAR_API_KEY is not set. Create one at https://linear.app/settings/api',
    );
  }
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: key,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Linear HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as GqlResult<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  if (!json.data) throw new Error('Linear returned no data');
  return json.data;
}

async function main() {
  const { teams } = await gql<{ teams: { nodes: { id: string; name: string; key: string }[] } }>(
    `query { teams { nodes { id name key } } }`,
  );

  const teamKey = process.env.LINEAR_TEAM_KEY;
  const team =
    teams.nodes.find((t) => t.key === teamKey) ??
    teams.nodes.find((t) => t.key.toLowerCase() === 'bmx') ??
    teams.nodes[0];

  if (!team) throw new Error('No Linear teams found in workspace');

  const projectName =
    process.env.LINEAR_PROJECT_NAME ?? 'Beatsmaxxer Pro — WebGPU Engine Sprint';

  const projectDescription = [
    'SvelteKit 5 + WebGPU-only audio-reactive video FX rack.',
    'North star: Cable Guy–style plugins for video — zero-flash PGM cuts first.',
    '',
    'Repo handoff: docs/agents/continuity.md',
    'Research: research/webgpu-peers/',
    'Validate on: bun run dev (web rack, platform 2)',
  ].join('\n');

  const { projectCreate } = await gql<{
    projectCreate: { success: boolean; project: { id: string; name: string; url: string } };
  }>(
    `mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        success
        project { id name url }
      }
    }`,
    {
      input: {
        name: projectName,
        teamIds: [team.id],
        description: projectDescription,
        color: '#5E6AD2',
        icon: ':film_projector:',
      },
    },
  );

  if (!projectCreate.success) throw new Error('projectCreate failed');
  const projectId = projectCreate.project.id;
  console.log(`Project: ${projectCreate.project.name}`);
  console.log(projectCreate.project.url);

  type IssueDef = {
    title: string;
    description: string;
    priority?: number;
    blockedBy?: string[];
  };

  const issues: IssueDef[] = [
    {
      title: 'Research: deepen FreeCut analysis',
      description: [
        'Deepen `research/webgpu-peers/analyses/freecut.md` from local clone.',
        '',
        'Focus: dual texture path, effect registry, destRect blit, Mediabunny.',
        'Clone: `research/webgpu-peers/repos/freecut/`',
        '',
        'Acceptance: file:line citations for patterns relevant to WebGpuEngine.',
      ].join('\n'),
      priority: 2,
    },
    {
      title: 'Research: deepen Beatform analysis',
      description: [
        'Deepen `research/webgpu-peers/analyses/beatform.md` from local clone.',
        '',
        'Focus: wgslLib, FixedFeedbackClock, pipeline cache, deterministic export.',
        'Clone: `research/webgpu-peers/repos/beatform/`',
      ].join('\n'),
      priority: 2,
    },
    {
      title: 'Research: spektral pipeline cache + dynamic WGSL',
      description: [
        'New analysis: `research/webgpu-peers/analyses/spektral.md`.',
        '',
        'Focus: pipeline cache, dynamic WGSL (future user-shader lane).',
        'Clone: `research/webgpu-peers/repos/spektral/`',
        'Template: `research/webgpu-peers/template/ANALYSIS.md`',
      ].join('\n'),
      priority: 3,
    },
    {
      title: 'Research: webgpu-video-shaders WGSL donors',
      description: [
        'New analysis: `research/webgpu-peers/analyses/webgpu-video-shaders.md`.',
        '',
        'Focus: deband/color WGSL for future catalog modules.',
        'Clone: `research/webgpu-peers/repos/webgpu-video-shaders/`',
      ].join('\n'),
      priority: 3,
    },
    {
      title: 'Implement: VideoPool arm-at-trim + rVFC after seek',
      description: [
        'Beat-quantized PGM cuts without seek flash. AGPL clean-room from Ghost Arcade pattern.',
        '',
        'Files: `svelte/src/lib/media/VideoPool.ts`, possibly `PgmDirector.ts`',
        'Reference: `research/webgpu-peers/analyses/ghost-arcade.md`',
        '',
        'Acceptance:',
        '- Unit test on VideoPool arm/await contract (no GPU in CI)',
        '- QA autoload: PGM switch without stale frame on qa-clip.webm',
        '',
        'Platform: 2 (web rack). Branch: main.',
      ].join('\n'),
      priority: 1,
      blockedBy: ['Research: deepen FreeCut analysis', 'Research: deepen Beatform analysis'],
    },
    {
      title: 'Implement: bind group frequency split',
      description: [
        'Tier 1.2 — split volatile vs static bind groups (Toji / FreeCut pattern).',
        '',
        'Files: `svelte/src/lib/rendering/webgpu/WebGpuEngine.ts`',
        'Backlog: `research/webgpu-peers/IMPLEMENTATION-BACKLOG.md` §1.2',
        '',
        'Acceptance: same pixels; fewer bind group rebuilds on 8-preview frames.',
      ].join('\n'),
      priority: 2,
      blockedBy: ['Implement: VideoPool arm-at-trim + rVFC after seek'],
    },
    {
      title: 'Implement: wgslLib extraction + golden shader tests',
      description: [
        'Tier 1.3 — extract shared WGSL snippets; golden tests (Beatform pattern).',
        '',
        'Files: new `shaders/wgslLib.ts`, `moduleFx.wgsl.ts`, `tests/unit/rendering/`',
        '',
        'Acceptance: zero visual change in QA autoload hash gates.',
      ].join('\n'),
      priority: 3,
      blockedBy: ['Implement: bind group frequency split'],
    },
  ];

  const created = new Map<string, { id: string; identifier: string; url: string }>();

  for (const def of issues) {
    const { issueCreate } = await gql<{
      issueCreate: {
        success: boolean;
        issue: { id: string; identifier: string; url: string; title: string };
      };
    }>(
      `mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url title }
        }
      }`,
      {
        input: {
          teamId: team.id,
          projectId,
          title: def.title,
          description: def.description,
          priority: def.priority ?? 3,
        },
      },
    );

    if (!issueCreate.success) throw new Error(`Failed: ${def.title}`);
    created.set(def.title, issueCreate.issue);
    console.log(`  ${issueCreate.issue.identifier}  ${issueCreate.issue.title}`);
    console.log(`    ${issueCreate.issue.url}`);
  }

  for (const def of issues) {
    if (!def.blockedBy?.length) continue;
    const child = created.get(def.title);
    if (!child) continue;
    for (const blockerTitle of def.blockedBy) {
      const blocker = created.get(blockerTitle);
      if (!blocker) continue;
      await gql(
        `mutation($input: IssueRelationCreateInput!) {
          issueRelationCreate(input: $input) { success }
        }`,
        {
          input: {
            issueId: blocker.id,
            relatedIssueId: child.id,
            type: 'blocks',
          },
        },
      );
      console.log(`  blocked: ${child.identifier} ← ${blocker.identifier}`);
    }
  }

  console.log('\nDone. Link project in docs/agents/linear.md if this is your tracker of record.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
