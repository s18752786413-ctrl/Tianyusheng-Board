import React,{useState} from 'react';
import {supabase} from './cloud.js';

export default function Login({session,recovering,onRecovered,onPreview}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const reset=recovering&&!!session;
 const submit=async e=>{e.preventDefault();setBusy(true);setMessage('');try{
  if(reset){if(password.length<8)throw Error('新密码至少8位');if(password!==confirm)throw Error('两次输入的密码不一致');const {error}=await supabase.auth.updateUser({password});if(error)throw error;setPassword('');setConfirm('');onRecovered();}
  else{const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('');setMessage('登录成功，正在读取授权数据…');}
 }catch(e){setMessage(e.code==='invalid_credentials'?'账号或密码不正确':e.code==='email_not_confirmed'?'请先验证邮箱':e.code==='weak_password'?'密码强度不足，请按账号服务要求设置':e.message==='Failed to fetch'?'连接失败，请稍后重试':e.message);}finally{setBusy(false);}};
 const forgot=async()=>{setBusy(true);try{const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+location.pathname+'?reset=1#admin'});if(error)throw error;setMessage('如果此邮箱已建立账号，将收到密码设置邮件。请打开最新邮件中的链接。');}catch{setMessage('密码设置邮件发送失败，请稍后重试或联系管理员。');}finally{setBusy(false);}};
 return <section className="admin-card login-card"><div className="card-kicker">WELCOME BACK</div><h2>{reset?'设置新密码':'让每一次成长，都有记录'}</h2><p>{reset?'设置后可使用邮箱账号和密码登录。':'使用已获授权的QA或会长邮箱账号和密码登录。'}</p>{recovering&&!session&&<p>密码设置链接尚未验证；请打开最新邮件中的有效链接。</p>}<form onSubmit={submit}>{!reset&&<label>账号（邮箱）<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="邮箱地址"/></label>}<label>{reset?'新密码':'密码'}<input type="password" autoComplete={reset?'new-password':'current-password'} required minLength={reset?8:undefined} value={password} onChange={e=>setPassword(e.target.value)} placeholder={reset?'至少8位':'请输入密码'}/></label>{reset&&<label>确认新密码<input type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}<button className="primary" type="submit" disabled={busy}>{busy?'处理中…':reset?'保存新密码':'登录后台'}</button></form>{message&&<p role="status">{message}</p>}{!reset&&<button disabled={busy||!email.trim()} onClick={forgot}>忘记密码 / 首次设置密码</button>}<div className="login-preview"><p>账号由管理员建立并授权；首次登录需先设置密码。</p><button onClick={onPreview}>体验本机预览</button></div></section>;
}
