import module from 'module';
import jspmResolve from './resolve.js';

const winPathRegEx = /^[a-z]:\//i;
const isWindows = process.platform === 'win32';
const filePrefix = 'file://' + (isWindows ? '/' : '');

const cache = {};

module._nodeModulePaths = () => [];
module._resolveFilename = (request,  parent, isMain) => {
  if (request.match(winPathRegEx))
    request = '/' + request;
  let { resolved } = jspmResolve.sync(request, parent && parent.filename, { cjsResolve: true, cache });
  return resolved;
};

export async function resolve (name, parentUrl) {
  const { resolved, format } = await jspmResolve(name,
      decodeURI(parentUrl).substr(filePrefix.length), { cache });
  const url = filePrefix + encodeURI(resolved);
  return { url, format };
}
