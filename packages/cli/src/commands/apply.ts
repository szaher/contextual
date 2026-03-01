import { Command } from 'commander';

export const applyCommand = new Command('apply')
  .description('Approve and apply a .ctx update proposal by ID')
  .argument('<proposal-id>', 'The proposal ID to approve and apply')
  .option('--daemon <url>', 'Daemon URL', 'http://localhost:3742')
  .option('--reject', 'Reject the proposal instead of approving', false)
  .action(async (proposalId: string, options) => {
    const baseUrl = options.daemon;
    const action = options.reject ? 'rejected' : 'approved';

    try {
      // Step 1: Approve or reject the proposal
      const patchRes = await fetch(`${baseUrl}/api/v1/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      });

      if (!patchRes.ok) {
        const err = await patchRes.json();
        console.error(`Error: ${err.error?.message || 'Unknown error'}`);
        process.exitCode = 1;
        return;
      }

      const patchData = await patchRes.json();
      console.log(`Proposal ${proposalId}: ${patchData.status}`);

      if (options.reject) {
        console.log('Proposal rejected.');
        return;
      }

      // Step 2: Apply the approved proposal
      const applyRes = await fetch(
        `${baseUrl}/api/v1/proposals/${proposalId}/apply`,
        { method: 'POST' },
      );

      if (!applyRes.ok) {
        const err = await applyRes.json();
        console.error(`Error applying: ${err.error?.message || 'Unknown error'}`);
        process.exitCode = 1;
        return;
      }

      const applyData = await applyRes.json();
      console.log(`Applied! Audit entry: ${applyData.audit_id}`);
    } catch (err) {
      console.error(`Failed to connect to daemon at ${baseUrl}: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });
