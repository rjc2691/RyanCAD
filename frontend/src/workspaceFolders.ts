export interface FolderFile {path:string;data:string;sha256?:string}
export interface WorkspaceDirectory {
  getDirectoryHandle(name:string,options?:{create?:boolean}):Promise<WorkspaceDirectory>;
  getFileHandle(name:string,options?:{create?:boolean}):Promise<{getFile():Promise<File>;createWritable():Promise<{write(data:Uint8Array):Promise<void>;close():Promise<void>;abort():Promise<void>}>}>;
}
export const FOLDER_LIMIT=64_000_000;
export function safeFolderPath(path:string){
  return typeof path==='string' && path.length>0 && path.length<=500 && !/[\\:]/.test(path) && path.split('/').every(p=>p!==''&&p!=='.'&&p!=='..'&&!p.startsWith('.'));
}
async function handle(root:WorkspaceDirectory,path:string,create:boolean){
  if(!safeFolderPath(path))throw Error('Unsupported workspace file path.');
  const parts=path.split('/');let directory=root;
  for(const part of parts.slice(0,-1))directory=await directory.getDirectoryHandle(part,{create});
  return directory.getFileHandle(parts.at(-1)!,{create});
}
export async function writeWorkspaceFolder(root:WorkspaceDirectory,files:FolderFile[],overwrite:boolean,onProgress:(message:string)=>void){
  // Preflight every collision before creating directories or replacing files.
  if(!overwrite){
    let conflicts=0;
    for(const file of files){
      try{await handle(root,file.path,false);conflicts++;}
      catch(error:any){if(error.name!=='NotFoundError')throw error;}
    }
    if(conflicts)throw Error(`${conflicts} matching ${conflicts===1?'file exists':'files exist'}. Enable “Overwrite matching files” to replace them. No files were written.`);
  }
  // The index is last: import validates every indexed checksum, detecting an
  // interrupted write rather than silently opening a mixed snapshot.
  const ordered=[...files.filter(f=>f.path!=='workspace.json'),...files.filter(f=>f.path==='workspace.json')];
  for(const [index,file] of ordered.entries()){
    onProgress(`Writing ${index+1} of ${files.length} files`);
    const target=await handle(root,file.path,true),writer=await target.createWritable();
    try{await writer.write(Uint8Array.from(atob(file.data),c=>c.charCodeAt(0)));await writer.close();}
    catch(error){try{await writer.abort();}catch{}throw error;}
  }
}
export async function readWorkspaceFolder(read:(path:string)=>Promise<File>,onProgress:(message:string)=>void):Promise<FolderFile[]>{
  const manifestFile=await read('workspace.json');
  if(manifestFile.size>1_000_000)throw Error('The workspace index is too large.');
  const manifest=JSON.parse(await manifestFile.text());
  if(manifest.format!=='ryancad-workspace'||manifest.version!==1||!Array.isArray(manifest.files)||manifest.files.length>4999)throw Error('Choose a RyanCAD workspace folder containing workspace.json.');
  const paths=['workspace.json',...manifest.files.map((f:any)=>f.path)];
  if(paths.some(p=>!safeFolderPath(p))||new Set(paths.map(p=>p.toLowerCase())).size!==paths.length)throw Error('The workspace contains unsupported or duplicate file paths.');
  const result:FolderFile[]=[];let size=0;
  for(const [index,path] of paths.entries()){
    onProgress(`Reading ${index+1} of ${paths.length} files`);
    const file=path==='workspace.json'?manifestFile:await read(path);size+=file.size;
    if(size>FOLDER_LIMIT)throw Error('Folder transfers support at most 64 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
    for(let start=0;start<bytes.length;start+=24576)binary+=String.fromCharCode(...bytes.subarray(start,start+24576));
    result.push({path,data:btoa(binary)});
  }
  return result;
}
export async function readDirectoryFile(root:WorkspaceDirectory,path:string){return (await handle(root,path,false)).getFile();}
