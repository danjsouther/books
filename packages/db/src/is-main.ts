import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** True when this module is the file Node was asked to run, so a module can both
 *  export a function and act as a CLI without a separate bin file. */
export function isMain(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return fileURLToPath(moduleUrl) === resolve(entry);
}
