const { spawn } = require('child_process');
const path = require('path');

// In-memory job store
const jobs = {};

function triggerScraperJob() {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  jobs[jobId] = {
    jobId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    output: '',
    error: null
  };

  // Run scraper in next tick
  setImmediate(() => {
    runScraperProcess(jobId);
  });

  return jobId;
}

function runScraperProcess(jobId) {
  const job = jobs[jobId];
  if (!job) return;

  job.status = 'running';
  job.startedAt = new Date().toISOString();

  const pythonCmd = process.env.PYTHON_CMD || 'python';
  const scriptPath = process.env.SCRAPER_SCRIPT_PATH
    ? path.resolve(__dirname, process.env.SCRAPER_SCRIPT_PATH)
    : path.resolve(__dirname, '..', 'scraper', 'pipeline.py');

  const scraperDir = path.dirname(scriptPath);

  console.log(`[Job ${jobId}] Spawning ${pythonCmd} ${scriptPath} in ${scraperDir}`);

  const child = spawn(pythonCmd, ['-u', path.basename(scriptPath)], {
    cwd: scraperDir,
    env: {
      ...process.env,
      DATABASE_PATH: process.env.DATABASE_PATH
        ? path.resolve(__dirname, process.env.DATABASE_PATH)
        : path.resolve(__dirname, 'newspulse.sqlite')
    }
  });

  child.stdout.on('data', (data) => {
    const text = data.toString();
    job.output += text;
    console.log(`[Job ${jobId} stdout] ${text.trim()}`);
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    job.output += text;
    console.error(`[Job ${jobId} stderr] ${text.trim()}`);
  });

  child.on('close', (code) => {
    job.completedAt = new Date().toISOString();
    if (code === 0) {
      job.status = 'completed';
      console.log(`[Job ${jobId}] Completed successfully.`);
    } else {
      job.status = 'failed';
      job.error = `Scraper exited with non-zero exit code ${code}`;
      console.error(`[Job ${jobId}] Failed with exit code ${code}.`);
    }
  });

  child.on('error', (err) => {
    job.status = 'failed';
    job.completedAt = new Date().toISOString();
    job.error = err.message;
    console.error(`[Job ${jobId}] Spawn error:`, err);
  });
}

function getJobStatus(jobId) {
  return jobs[jobId] || null;
}

module.exports = {
  triggerScraperJob,
  getJobStatus
};
