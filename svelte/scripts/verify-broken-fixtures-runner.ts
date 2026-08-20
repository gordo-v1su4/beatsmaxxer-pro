#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateArtifactProvenance, type ArtifactProvenance } from '../src/lib/qa/artifactProvenance.ts';
import {
  M0_BROKEN_FIXTURE_MATRIX,
  fixtureMatchesExpectedBlocker
} from '../src/lib/qa/brokenFixtureMatrix.ts';

const FIXTURE_DIR = join(import.meta.dir, '../tests/fixtures/qa-fixtures');

async function verifyBrokenFixtures() {
  const failures: string[] = [];
  const files = (await readdir(FIXTURE_DIR)).filter((name) => name.startsWith('broken-') && name.endsWith('.json'));
  if (files.length === 0) {
    throw new Error(`No broken fixtures found in ${FIXTURE_DIR}. Run broken-fixture-gates.test.ts once to generate them.`);
  }

  for (const file of files) {
    const payload = JSON.parse(await readFile(join(FIXTURE_DIR, file), 'utf8')) as {
      id: string;
      expectedBlocker: string;
      provenance: ArtifactProvenance;
    };
    const blockers = validateArtifactProvenance(payload.provenance);
    if (!fixtureMatchesExpectedBlocker(blockers, payload.expectedBlocker)) {
      failures.push(`${file}: expected blocker containing ${JSON.stringify(payload.expectedBlocker)}; got ${JSON.stringify(blockers)}`);
    }
  }

  const expectedIds = M0_BROKEN_FIXTURE_MATRIX.filter((entry) => entry.kind === 'provenance-only').map((entry) => entry.id);
  for (const id of expectedIds) {
    if (!files.includes(`broken-${id}.json`)) {
      failures.push(`missing checked-in fixture broken-${id}.json`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Broken fixture verification failed:\n- ${failures.join('\n- ')}`);
  }

  console.log(`verify-broken-fixtures PASSED (${files.length} fixtures)`);
}

await verifyBrokenFixtures();
