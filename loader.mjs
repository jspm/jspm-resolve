import module from 'module';
import jspmResolve from './resolve.js';

const winPathRegEx = /^[a-z]:\//i;
const isWindows = process.platform === 'win32';
const filePrefix = 'file://' + (isWindows ? '/' : '');

let cjsReplace = false;
{
  const nodeVersion = process.versions.node.split('.');
  if (nodeVersion[0] === '8') {
    const minor = parseInt(nodeVersion[1]);
    cjsReplace = minor < 9 || minor === 9 && parseInt(nodeVersion[2]) < 4;
  }
  else if (nodeVersion[0] === '9') {
    const minor = parseInt(nodeVersion[1]);
    cjsReplace = minor < 4 || minor === 4 && parseInt(nodeVersion[2]) < 1;
  }
}

const cache = {};

module._nodeModulePaths = () => [];
module._resolveFilename = (request, parent, isMain) => {
  if (request.match(winPathRegEx))
    request = '/' + request;
  if (request[request.length - 1] === '/')
    request = request.substr(0, request.length - 1);
  const { resolved } = jspmResolve.sync(request, parent && parent.filename, { cjsResolve: true, cache });
  return resolved;
};

export async function resolve (name, parentUrl) {
  if (name[name.length - 1] === '/')
    name = name.substr(0, name.length - 1);
  const { resolved, format } = await jspmResolve(name,
      decodeURI(parentUrl).substr(filePrefix.length), { cache });
  if (format === undefined)
    throw new Error(`Unable to load ${resolved}, as it does not have a valid module format file extension.`);
  const url = format === 'builtin' ? resolved : filePrefix + encodeURI(resolved);
  return { url, format: cjsReplace && format === 'commonjs' ? 'cjs' : format };
}
