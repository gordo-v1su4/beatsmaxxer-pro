/**
 * Wire Cursor's `.claude/skills` to the committed canonical tree in `.agents/skills`.
 * Safe to re-run after clone or when skills are added.
 */
import { lstat, mkdir, readdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const agentsSkillsDir = join(repoRoot, '.agents', 'skills');
const claudeSkillsDir = join(repoRoot, '.claude', 'skills');

async function isExistingLink(path: string): Promise<boolean> {
	try {
		const stat = await lstat(path);
		return stat.isSymbolicLink();
	} catch {
		return false;
	}
}

async function linkSkill(name: string): Promise<void> {
	const target = join(agentsSkillsDir, name);
	const linkPath = join(claudeSkillsDir, name);

	if (await isExistingLink(linkPath)) {
		await rm(linkPath, { recursive: true });
	}

	const relativeTarget = join('..', '..', '.agents', 'skills', name);

	if (process.platform === 'win32') {
		await symlink(target, linkPath, 'junction');
		return;
	}

	await symlink(relativeTarget, linkPath, 'dir');
}

async function main(): Promise<void> {
	const entries = await readdir(agentsSkillsDir, { withFileTypes: true });
	const skillNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);

	if (skillNames.length === 0) {
		console.warn('No skills found under .agents/skills — nothing to link.');
		return;
	}

	await mkdir(claudeSkillsDir, { recursive: true });

	for (const name of skillNames) {
		await linkSkill(name);
	}

	console.log(`Linked ${skillNames.length} skills: .claude/skills → .agents/skills`);
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
