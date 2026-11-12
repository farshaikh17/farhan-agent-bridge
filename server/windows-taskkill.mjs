import {win32} from 'node:path';

// Avoid resolving taskkill.exe through an unrelated PATH entry. The system root
// still comes from the process environment and must itself be trustworthy.
export function windowsTaskkillPath(env) {
  const root=env.SystemRoot || env.SYSTEMROOT || env.WINDIR;
  if(typeof root!=='string' || !/^[a-z]:[\\/]/i.test(root) || root.includes('\0'))
    throw new Error('Windows system directory is unavailable.');
  return win32.join(root,'System32','taskkill.exe');
}
