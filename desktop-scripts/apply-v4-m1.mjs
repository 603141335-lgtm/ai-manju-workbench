// Apply AFTER v3 M2; preserve all existing web sessions and workflow code.
import fs from 'node:fs';
import path from 'node:path';
const file=path.resolve(process.argv[2]||'.','src/host/index.ts');
const src=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const old="    openMember: (provider: string): Promise<void> => invoke('domestic_open_member', {provider}),";
const add="    openMemberSlot: (provider: string, slot: number): Promise<void> => invoke('domestic_open_member', {provider,slot}),";
if(!src.includes(old)||src.includes(add))throw Error('v4 bridge incompatible or already installed');
fs.writeFileSync(file,src.replace(old,old+'\n'+add),'utf8');
console.log('v4 native account-slot bridge ready');
