'use strict';
// The pinned electron-builder rewrites the Windows EXE to add the ASAR integrity
// resource. Some Windows file filters briefly deny that open immediately after
// Electron is extracted. Retry only that generated EXE, without changing data.
const fs = require('node:fs/promises');
const {setTimeout: delay} = require('node:timers/promises');
const writeFile = fs.writeFile;

fs.writeFile = async function(file, data, options) {
  if (!/[\\/]release[\\/]win-unpacked[\\/][^\\/]+\.exe$/i.test(String(file)))
    return writeFile(file, data, options);
  for (let attempt = 0; ; attempt++) {
    try { return await writeFile(file, data, options); }
    catch (error) {
      if (attempt >= 9 || !['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES'].includes(error?.code)) throw error;
      console.warn('[BUILD FILE] Windows temporarily denied the generated EXE; retrying integrity resource write.');
      await delay(300 * (attempt + 1));
    }
  }
};
