// Only a synchronous spawn failure or an error before the spawn event proves
// that this worker did not start. Fail closed for failures after it started.
export async function launchWorker(job, {start, save}) {
  let child;
  try {
    child=start();
    await new Promise((resolve,reject)=>{
      child.once('spawn',resolve);
      child.once('error',reject);
    });
  } catch {
    job.status='failed';
    job.error='Worker could not be started; no task was run.';
    job.finished_at=new Date().toISOString();
    delete job.task;
    try { save(job); }
    catch { throw new Error(`Worker could not be started and its record could not be updated. Task ID: ${job.id}. See README job recovery.`); }
    throw new Error(`Worker could not be started. Task ID: ${job.id}. No task was run; check local system resources and retry.`);
  }
  child.unref();
}
