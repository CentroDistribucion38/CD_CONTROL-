import { chromium } from 'playwright';
const S='/home/claude/cd38-inventario/.arnes';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:360,height:640},deviceScaleFactor:2});
p.on('pageerror', e=>console.log('ERROR JS:', e.message.split('\n')[0]));
await p.goto('file://'+S+'/pf.html');
try { await p.waitForSelector('.pf-switch, .pf', {timeout:6000}) } catch { console.log('no montó') }
await p.waitForTimeout(400);
await p.screenshot({path:S+'/pf-cel.png', fullPage:true});
console.log('secciones:', await p.$$eval('.pf-nav button', bs=>bs.map(b=>b.textContent.trim())).catch(()=>'—'));
await b.close();
