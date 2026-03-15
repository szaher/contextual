import type { PrContext } from '../types/pr-context.js';

/**
 * Render a PrContext document as markdown.
 */
export function renderMarkdown(ctx: PrContext): string {
  const lines: string[] = [];

  // Header
  lines.push('## Change Context');
  lines.push('');
  lines.push(`**Generated**: ${ctx.generated_at}`);
  if (ctx.branch) lines.push(`**Branch**: ${ctx.branch}`);
  if (ctx.git_range) lines.push(`**Range**: \`${ctx.git_range}\``);
  lines.push(`**Sessions**: ${ctx.session_ids.join(', ')}`);
  lines.push('');

  // Summary
  lines.push('### Summary');
  lines.push('');
  lines.push(ctx.summary);
  lines.push('');

  // Motivation
  if (ctx.motivation) {
    lines.push('### Motivation');
    lines.push('');
    lines.push(ctx.motivation);
    lines.push('');
  }

  // Prompt Chain
  if (ctx.prompt_chain.length > 0) {
    lines.push('### Prompt Chain');
    lines.push('');
    lines.push('| # | Timestamp | Prompt | Tools | Files |');
    lines.push('|---|-----------|--------|-------|-------|');
    for (const entry of ctx.prompt_chain) {
      const prompt = entry.prompt.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const truncatedPrompt = prompt.length > 80 ? prompt.slice(0, 80) + '...' : prompt;
      const tools = entry.tools_used.join(', ') || '-';
      const files = entry.files_touched.length > 0 ? entry.files_touched.slice(0, 3).join(', ') : '-';
      lines.push(`| ${entry.index} | ${entry.timestamp.split('T')[0]} | ${truncatedPrompt} | ${tools} | ${files} |`);
    }
    lines.push('');
  }

  // Agent Decisions
  if (ctx.agent_decisions.length > 0) {
    lines.push('### Agent Decisions');
    lines.push('');
    lines.push('| Decision | Reason | Source | Context |');
    lines.push('|----------|--------|--------|---------|');
    for (const d of ctx.agent_decisions) {
      const decision = d.decision.replace(/\|/g, '\\|');
      const reason = d.reason.replace(/\|/g, '\\|');
      const ctxRef = d.context_ref || '-';
      lines.push(`| ${decision} | ${reason} | ${d.source} | ${ctxRef} |`);
    }
    lines.push('');
  }

  // Context Used
  if (ctx.context_used.length > 0) {
    lines.push('### Context References');
    lines.push('');
    for (const c of ctx.context_used) {
      lines.push(`- **${c.ctx_path}** (score: ${c.score.toFixed(2)}) — sections: ${c.sections_used.join(', ')}`);
    }
    lines.push('');
  }

  // File Changes
  if (ctx.files_changed.length > 0) {
    lines.push('### Files Changed');
    lines.push('');
    lines.push('| File | Type | +Lines | -Lines |');
    lines.push('|------|------|--------|--------|');
    for (const f of ctx.files_changed) {
      lines.push(`| ${f.path} | ${f.change_type} | +${f.lines_added} | -${f.lines_removed} |`);
    }
    lines.push('');
  }

  // .ctx Updates
  if (ctx.ctx_updates.length > 0) {
    lines.push('### Context Updates');
    lines.push('');
    for (const u of ctx.ctx_updates) {
      lines.push(`- **${u.ctx_path}**: ${u.version_change || 'updated'}`);
      if (u.diff_summary) lines.push(`  ${u.diff_summary}`);
    }
    lines.push('');
  }

  // Spec References
  if (ctx.spec_references.length > 0) {
    lines.push('### Spec References');
    lines.push('');
    for (const s of ctx.spec_references) {
      lines.push(`- [${s.spec_path}](${s.spec_path}) — ${s.relationship} (${s.section})`);
    }
    lines.push('');
  }

  // Stats
  lines.push('### Stats');
  lines.push('');
  lines.push(`- **Prompts**: ${ctx.stats.total_prompts}`);
  lines.push(`- **Tool calls**: ${ctx.stats.total_tool_calls}`);
  lines.push(`- **Tokens**: ${ctx.stats.total_tokens_used.toLocaleString()}`);
  if (ctx.stats.session_duration_ms > 0) {
    const durationMin = Math.round(ctx.stats.session_duration_ms / 60000);
    lines.push(`- **Duration**: ${durationMin} min`);
  }
  lines.push(`- **Files changed**: ${ctx.stats.files_changed_count}`);
  lines.push(`- **Lines**: +${ctx.stats.lines_added} / -${ctx.stats.lines_removed}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Render a PrContext document as JSON.
 */
export function renderJson(ctx: PrContext): string {
  return JSON.stringify(ctx, null, 2);
}

/**
 * Render a PrContext for GitHub CLI (pipe-friendly, suitable for gh pr create --body-file).
 */
export function renderGhBody(ctx: PrContext): string {
  return renderMarkdown(ctx);
}
