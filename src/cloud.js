import {createClient} from '@supabase/supabase-js';
export const SUPABASE_URL='https://ziwxqeqefyisxwvgrhdw.supabase.co';
export const supabase=createClient(SUPABASE_URL,'sb_publishable_uJQTEEMJIF4h8Vj_9vS0wg_cMmbRTA5',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
export async function publicBoard(){const {data,error}=await supabase.rpc('tys_public_board');if(error)throw error;return data;}
export async function loadPrivate(){const controller=new AbortController();let timer;try{const result=await Promise.race([supabase.rpc('tys_load').abortSignal(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('读取后台数据超时，请检查网络后重试'));},15000);})]);if(result.error)throw result.error;return result.data;}finally{clearTimeout(timer);}}
export async function savePrivate(state,revision){const {data,error}=await supabase.rpc('tys_save',{payload:state,expected_revision:revision});if(error)throw error;return data;}
export async function uploadImage(file){const key=crypto.randomUUID()+'.'+(file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg');const {error}=await supabase.storage.from('tys-display').upload(key,file,{contentType:file.type,upsert:false});if(error)throw error;return supabase.storage.from('tys-display').getPublicUrl(key).data.publicUrl;}
