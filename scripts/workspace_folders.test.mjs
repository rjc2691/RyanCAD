import test from 'node:test';
import assert from 'node:assert/strict';
import {writeWorkspaceFolder,readWorkspaceFolder,readDirectoryFile} from '../frontend/src/workspaceFolders.ts';

function directory(initial={}){
 const files=new Map(Object.entries(initial)),writes=[];
 const root=(prefix='')=>({
  async getDirectoryHandle(name,{create}={}){
   const path=prefix+name+'/';
   if(!create&&![...files.keys()].some(key=>key.startsWith(path)))throw new DOMException('Missing folder','NotFoundError');
   return root(path);
  },
  async getFileHandle(name,{create}={}){
   const path=prefix+name;
   if(!create&&!files.has(path))throw new DOMException('Missing file','NotFoundError');
   return {async getFile(){return new File([files.get(path)],name)},async createWritable(){let pending;return {
    async write(bytes){pending=bytes},async close(){files.set(path,pending);writes.push(path)},async abort(){pending=undefined}
   }}};
  }
 });
 return {root:root(),files,writes};
}
const records=[{path:'designs/a/manifest.yaml',data:btoa('new')},{path:'workspace.json',data:btoa('index')}];
test('folder export preflights collisions before writing any file',async()=>{
 const d=directory({'workspace.json':'existing'});
 await assert.rejects(writeWorkspaceFolder(d.root,records,false,()=>{}),/Overwrite matching files/);
 assert.deepEqual(d.writes,[]);assert.equal(d.files.get('workspace.json'),'existing');
});
test('overwrite replaces matching files, retains unrelated files, and writes index last',async()=>{
 const d=directory({'workspace.json':'existing','notes.txt':'keep'});
 await writeWorkspaceFolder(d.root,records,true,()=>{});
 assert.deepEqual(d.writes,['designs/a/manifest.yaml','workspace.json']);
 assert.equal(d.files.get('notes.txt'),'keep');assert.equal(new TextDecoder().decode(d.files.get('workspace.json')),'index');
});
test('directory import reads only indexed files and reports missing or unsafe entries',async()=>{
 const index=JSON.stringify({format:'ryancad-workspace',version:1,files:[{path:'designs/a/manifest.yaml'}]});
 const d=directory({'workspace.json':index,'designs/a/manifest.yaml':'document','notes.txt':'ignore'});
 const files=await readWorkspaceFolder(path=>readDirectoryFile(d.root,path),()=>{});
 assert.deepEqual(files.map(f=>f.path),['workspace.json','designs/a/manifest.yaml']);
 assert.equal(atob(files[1].data),'document');
 d.files.delete('designs/a/manifest.yaml');await assert.rejects(readWorkspaceFolder(path=>readDirectoryFile(d.root,path),()=>{}));
 d.files.set('workspace.json',JSON.stringify({format:'ryancad-workspace',version:1,files:[{path:'../outside'}]}));
 await assert.rejects(readWorkspaceFolder(path=>readDirectoryFile(d.root,path),()=>{}),/unsupported/);
});
