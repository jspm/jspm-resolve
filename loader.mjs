import module from 'module';
import jspmResolve from './resolve.js';

const winPathRegEx = /^[a-z]:\//i;
const isWindows = process.platform === 'win32';
const filePrefix = 'file://' + (isWindows ? '/' : '');

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
  let { resolved, format } = await jspmResolve(name, parentUrl ? decodeURI(parentUrl).substr(filePrefix.length) : undefined, { cache });
  if (format === 'unknown')
    throw new Error(`Unable to load ${resolved}, as it does not have a valid module format file extension.`);
  if (format === 'builtin' && resolved === '@empty') {
    format = 'esm';
    resolved = '@jspm/node-builtins/' + resolved + '.js';
  }
  const url = format === 'builtin' ? resolved : filePrefix + encodeURI(resolved);
  return { url, format };
}
