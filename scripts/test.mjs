import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
for(const file of readdirSync("tests").filter(file=>file.endsWith(".test.ts")).sort()){
  const result=spawnSync(process.execPath,["--import","tsx",`tests/${file}`],{stdio:"inherit"});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
