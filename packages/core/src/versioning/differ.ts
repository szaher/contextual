import type { CtxFile } from '../types/ctx.js';
import type { CtxDiff, SectionDiff } from '../types/history.js';

/**
 * Compare two CtxFile objects and produce a structured CtxDiff
 * with per-section changes (added, removed, modified entries).
 */
export function diffCtxVersions(
  before: CtxFile,
  after: CtxFile,
  fromVersion: number,
  toVersion: number,
): CtxDiff {
  const sections: SectionDiff[] = [];

  // key_files: compare by path
  const beforePaths = new Map(before.key_files.map((kf) => [kf.path, kf]));
  const afterPaths = new Map(after.key_files.map((kf) => [kf.path, kf]));

  const addedKf = [...afterPaths.keys()].filter((p) => !beforePaths.has(p));
  const removedKf = [...beforePaths.keys()].filter((p) => !afterPaths.has(p));
  const modifiedKf = [...afterPaths.keys()].filter((p) => {
    if (!beforePaths.has(p)) return false;
    return JSON.stringify(beforePaths.get(p)) !== JSON.stringify(afterPaths.get(p));
  });

  if (addedKf.length > 0) sections.push({ section: 'key_files', type: 'added', entries: addedKf });
  if (removedKf.length > 0) sections.push({ section: 'key_files', type: 'removed', entries: removedKf });
  if (modifiedKf.length > 0) sections.push({ section: 'key_files', type: 'modified', entries: modifiedKf });

  // contracts: compare by name
  const beforeContracts = new Map(before.contracts.map((c) => [c.name, c]));
  const afterContracts = new Map(after.contracts.map((c) => [c.name, c]));

  const addedC = [...afterContracts.keys()].filter((n) => !beforeContracts.has(n));
  const removedC = [...beforeContracts.keys()].filter((n) => !afterContracts.has(n));
  const modifiedC = [...afterContracts.keys()].filter((n) => {
    if (!beforeContracts.has(n)) return false;
    return JSON.stringify(beforeContracts.get(n)) !== JSON.stringify(afterContracts.get(n));
  });

  if (addedC.length > 0) sections.push({ section: 'contracts', type: 'added', entries: addedC });
  if (removedC.length > 0) sections.push({ section: 'contracts', type: 'removed', entries: removedC });
  if (modifiedC.length > 0) sections.push({ section: 'contracts', type: 'modified', entries: modifiedC });

  // decisions: compare by id
  const beforeDecisions = new Map(before.decisions.map((d) => [d.id, d]));
  const afterDecisions = new Map(after.decisions.map((d) => [d.id, d]));

  const addedD = [...afterDecisions.keys()].filter((id) => !beforeDecisions.has(id));
  const removedD = [...beforeDecisions.keys()].filter((id) => !afterDecisions.has(id));
  const modifiedD = [...afterDecisions.keys()].filter((id) => {
    if (!beforeDecisions.has(id)) return false;
    return JSON.stringify(beforeDecisions.get(id)) !== JSON.stringify(afterDecisions.get(id));
  });

  if (addedD.length > 0) sections.push({ section: 'decisions', type: 'added', entries: addedD });
  if (removedD.length > 0) sections.push({ section: 'decisions', type: 'removed', entries: removedD });
  if (modifiedD.length > 0) sections.push({ section: 'decisions', type: 'modified', entries: modifiedD });

  // gotchas: compare by text (no unique key)
  const beforeGotchaTexts = new Set(before.gotchas.map((g) => g.text));
  const afterGotchaTexts = new Set(after.gotchas.map((g) => g.text));

  const addedG = [...afterGotchaTexts].filter((t) => !beforeGotchaTexts.has(t));
  const removedG = [...beforeGotchaTexts].filter((t) => !afterGotchaTexts.has(t));

  if (addedG.length > 0) sections.push({ section: 'gotchas', type: 'added', entries: addedG.map((_, i) => `gotcha_${i}`) });
  if (removedG.length > 0) sections.push({ section: 'gotchas', type: 'removed', entries: removedG.map((_, i) => `gotcha_${i}`) });

  // tags
  const beforeTags = new Set(before.tags);
  const afterTags = new Set(after.tags);

  const addedTags = [...afterTags].filter((t) => !beforeTags.has(t));
  const removedTags = [...beforeTags].filter((t) => !afterTags.has(t));

  if (addedTags.length > 0) sections.push({ section: 'tags', type: 'added', entries: addedTags });
  if (removedTags.length > 0) sections.push({ section: 'tags', type: 'removed', entries: removedTags });

  // summary
  if (before.summary !== after.summary) {
    sections.push({ section: 'summary', type: 'modified', entries: ['summary'] });
  }

  // commands
  const beforeCmdKeys = new Set(Object.keys(before.commands));
  const afterCmdKeys = new Set(Object.keys(after.commands));

  const addedCmds = [...afterCmdKeys].filter((k) => !beforeCmdKeys.has(k));
  const removedCmds = [...beforeCmdKeys].filter((k) => !afterCmdKeys.has(k));
  const modifiedCmds = [...afterCmdKeys].filter((k) => beforeCmdKeys.has(k) && before.commands[k] !== after.commands[k]);

  if (addedCmds.length > 0) sections.push({ section: 'commands', type: 'added', entries: addedCmds });
  if (removedCmds.length > 0) sections.push({ section: 'commands', type: 'removed', entries: removedCmds });
  if (modifiedCmds.length > 0) sections.push({ section: 'commands', type: 'modified', entries: modifiedCmds });

  // Generate summary
  const summaryParts: string[] = [];
  for (const s of sections) {
    const prefix = s.type === 'added' ? '+' : s.type === 'removed' ? '-' : '~';
    summaryParts.push(`${prefix}${s.entries.length} ${s.section}`);
  }

  return {
    from_version: fromVersion,
    to_version: toVersion,
    sections,
    summary: summaryParts.join(', ') || 'no changes',
  };
}
