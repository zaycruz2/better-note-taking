import type { ProjectRecord, ProjectStatus } from '../types';

function statusTag(status: ProjectStatus): string {
  return `#${status}`;
}

function reasonPrefix(status: ProjectStatus): string {
  if (status === 'active') return 'blocking';
  if (status === 'paused') return 'paused';
  if (status === 'killed') return 'killed';
  return 'note';
}

/**
 * Format projects into a text-first block for display in the left panel.
 * MVP: read-only representation (no parse->DB sync yet).
 */
export function formatProjectsAsText(projects: ProjectRecord[]): string {
  const lines: string[] = ['[PROJECTS]'];

  if (!projects || projects.length === 0) {
    lines.push('');
    lines.push('# Add your first project in the Projects view');
    const text = lines.join('\n');
    return text.endsWith('\n') ? text : text + '\n';
  }

  for (const p of projects) {
    const name = (p.name || '').trim() || '(Untitled)';
    const desc = (p.description || '').trim();
    const mainLine = desc ? `${name} ${statusTag(p.status)} - ${desc}` : `${name} ${statusTag(p.status)}`;
    lines.push(mainLine);

    const reason = (p.blocking_or_reason || '').trim();
    if (reason) {
      lines.push(`  - ${reasonPrefix(p.status)}: ${reason}`);
    }
  }

  const text = lines.join('\n');
  return text.endsWith('\n') ? text : text + '\n';
}

