const { resolveProject } = require('../project');
const { startStudio } = require('../studio-server');

function runStudio(cwd = process.cwd(), options = {}) {
  const project = resolveProject(cwd);
  if (options.host) project.manifest.studio.host = options.host;
  if (options.port !== undefined) project.manifest.studio.port = Number(options.port);
  if (options.openBrowser !== undefined) project.manifest.studio.openBrowser = options.openBrowser;
  return startStudio(project);
}

module.exports = runStudio;
