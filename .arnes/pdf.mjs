import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
await p.goto('file:///home/claude/cd38-inventario/.arnes/guion.html', { waitUntil: 'networkidle' });
await p.emulateMedia({ media: 'print', colorScheme: 'light' });
await p.waitForTimeout(900);
await p.pdf({
  path: '/mnt/user-data/outputs/Presentar-CONTROL.pdf',
  format: 'A4', printBackground: true,
  margin: { top: '16mm', bottom: '16mm', left: '17mm', right: '17mm' },
});
await b.close();
console.log('pdf listo');
