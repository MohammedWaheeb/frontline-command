import {copyFile,mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const licenseName=/^(license|licence|copying|notice)(\.|$)/i;
export async function copyDependencyLicenses(moduleDir,out){
 let count=0;
 for(const name of (await readdir(moduleDir)).sort())if(licenseName.test(name)&&(await stat(path.join(moduleDir,name))).isFile()){
  await mkdir(out,{recursive:true});await copyFile(path.join(moduleDir,name),path.join(out,name));count++;
 }
 return count;
}

/** Only exact-version, integrity-bound supplements can fill a missing npm
 * notice. Validate every byte before writing any supplemental output. */
export async function copyNpmLicenses({moduleDir,out,lockEntry,supplementRoot}){
 const pkg=JSON.parse(await readFile(path.join(moduleDir,'package.json'),'utf8'));
 if(!pkg.name||!pkg.version||pkg.version!==lockEntry.version)throw Error('Installed npm dependency differs from the package lock');
 const count=await copyDependencyLicenses(moduleDir,out);if(count)return count;
 const manifest=JSON.parse(await readFile(path.join(supplementRoot,'manifest.json'),'utf8'));
 const entry=manifest.packages?.[`${pkg.name}@${pkg.version}`];
 if(manifest.format_version!==1||!entry||entry.name!==pkg.name||entry.version!==pkg.version||!lockEntry.integrity||entry.integrity!==lockEntry.integrity||!entry.files?.length)throw Error(`No verified supplemental license for ${pkg.name}@${pkg.version}`);
 const files=[],names=new Set();
 for(const file of entry.files){
  if(typeof file.path!=='string'||file.path.split('/').some(p=>!p||p==='.'||p==='..')||file.path.includes('\\')||!licenseName.test(path.basename(file.path))||names.has(path.basename(file.path)))throw Error('Invalid supplemental license path');
  names.add(path.basename(file.path));const bytes=await readFile(path.join(supplementRoot,file.path));
  if(digest(bytes)!==file.sha256)throw Error(`Supplemental license changed: ${file.path}`);
  if(file.source_file){
   if(file.source_file.split('/').some(p=>!p||p==='.'||p==='..')||file.source_file.includes('\\'))throw Error('Invalid supplemental license source path');
   if(digest(await readFile(path.join(moduleDir,file.source_file)))!==file.source_sha256)throw Error(`Supplemental license source changed: ${file.source_file}`);
  }
  files.push({name:path.basename(file.path),bytes});
 }
 await mkdir(out,{recursive:true});
 for(const file of files)await writeFile(path.join(out,file.name),file.bytes);
 return files.length;
}
