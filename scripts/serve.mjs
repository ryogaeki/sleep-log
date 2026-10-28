import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root=resolve("out");
const port=Number(process.env.PORT||3000);
const base=(process.env.PAGES_BASE_PATH||"").replace(/\/$/,"");
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".woff2":"font/woff2"};
await stat(root).catch(()=>{throw new Error("先に npm run build を実行してください。");});
const server=createServer(async(req,res)=>{
  try{
    const requestPath=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    if(base && requestPath===base){res.writeHead(302,{Location:`${base}/`});res.end();return;}
    if(base && !requestPath.startsWith(base+"/")){res.writeHead(404);res.end("Not found");return;}
    let target=resolve(root,"."+requestPath.slice(base.length));
    if(target!==root&&!target.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const info=await stat(target);
    if(info.isDirectory())target=resolve(target,"index.html");
    const contents=await readFile(target);
    res.writeHead(200,{"Content-Type":types[extname(target)]||"application/octet-stream","X-Content-Type-Options":"nosniff","Cache-Control":"no-store"});res.end(contents);
  }catch{res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});res.end("Not found");}
});
server.listen(port,"0.0.0.0",()=>console.log(`Local: http://localhost:${port}${base}/`));
