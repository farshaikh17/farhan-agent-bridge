// Keep the worker non-terminal until its answer has been checkpointed and cleanup
// attempted. A failed checkpoint must never remove the only answer file.
export function finalizeJob(job, {save, removeAnswer}) {
  delete job.task;
  job.finished_at=new Date().toISOString();
  if(job.provider!=='codex') { save(job); return; }

  const terminalStatus=job.status;
  job.status='running';
  save(job);
  try { removeAnswer(); }
  catch(e) {
    if(e.code!=='ENOENT') job.cleanup_warning='Could not remove the temporary answer file; delete it manually from the jobs folder.';
  }
  job.status=terminalStatus;
  save(job);
}
