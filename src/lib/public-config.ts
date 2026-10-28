export function validatePublicConfig(url: string, key: string): boolean {
  if (!url && !key) return false;
  const fail=()=>{throw new Error("SupabaseにはProject URLと公開用のPublishable keyまたはanon public keyを設定してください。");};
  if(!url || !key)return fail();
  let target:URL;try{target=new URL(url);}catch{return fail();}
  if(target.protocol!=="https:" && !(target.protocol==="http:"&&["localhost","127.0.0.1"].includes(target.hostname)))return fail();
  if(key.startsWith("sb_publishable_"))return true;
  if(key.startsWith("sb_secret_"))return fail();
  try{const payload=JSON.parse(atob(key.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));if(payload.role==="anon")return true;}catch{}
  return fail();
}
