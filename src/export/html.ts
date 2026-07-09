import type { Project } from '../types';
import { downloadBlob, sanitizeFilename } from '../utils';

/**
 * Generates a fully self-contained interactive HTML file:
 * images embedded as data URLs, viewer logic inlined, no external requests.
 */
export async function exportHtml(project: Project): Promise<void> {
  const json = JSON.stringify(project).replace(/</g, '\\u003c');
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(project.title)}</title>
<style>
:root{--bg:#f2f4f6;--panel:#ffffff;--fill:#f2f4f6;--fill2:#e5e8eb;--text:#191f28;--text2:#4e5968;--sub:#8b95a1;--accent:#3182f6;--accent2:#1b64da;--tint:#e8f3ff;--danger:#f04452}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI','Malgun Gothic',system-ui,sans-serif;letter-spacing:-.01em;height:100vh;display:flex;flex-direction:column;overflow:hidden;-webkit-font-smoothing:antialiased}
header{display:flex;align-items:center;gap:12px;padding:14px 24px;background:var(--panel);flex-shrink:0}
header h1{font-size:16px;font-weight:800;letter-spacing:-.02em;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.count{color:var(--sub);font-size:13px;font-weight:600}
.progress{height:3px;background:var(--fill);flex-shrink:0}
.progress i{display:block;height:100%;background:var(--accent);transition:width .3s}
main{flex:1;display:flex;align-items:center;justify-content:center;padding:20px;min-height:0}
.wrap{position:relative;max-width:100%;max-height:100%}
.wrap img{display:block;max-width:100%;max-height:calc(100vh - 230px);border-radius:14px;box-shadow:0 4px 16px rgba(2,32,71,.08);user-select:none}
.box{position:absolute;border:3px solid var(--accent);border-radius:6px;animation:pulse 1.5s ease-in-out infinite}
.box.click{cursor:pointer}
@keyframes pulse{0%,100%{box-shadow:0 0 0 4px rgba(49,130,246,.22),0 0 20px rgba(49,130,246,.35)}50%{box-shadow:0 0 0 9px rgba(49,130,246,.1),0 0 32px rgba(49,130,246,.5)}}
footer{background:var(--panel);padding:16px 24px;display:flex;align-items:center;gap:14px;flex-shrink:0;min-height:80px;border-top:1px solid var(--fill)}
.badge{background:var(--tint);color:var(--accent);font-size:12px;font-weight:700;padding:4px 11px;border-radius:8px;flex-shrink:0}
.cap{flex:1;min-width:0}
.desc{font-size:15px;font-weight:600}
.hint{font-size:12px;color:var(--sub);margin-top:3px}
button{background:var(--fill);color:var(--text2);border:none;border-radius:12px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:-.01em;transition:background .15s,transform .08s}
button:hover{background:var(--fill2)}
button:active{transform:scale(.97)}
button.primary{background:var(--accent);color:#fff}
button.primary:hover{background:var(--accent2)}
button:disabled{opacity:.35;cursor:default}
input{background:var(--fill);border:1.5px solid transparent;color:var(--text);border-radius:12px;padding:9px 14px;font-size:14px;font-family:inherit;width:220px;transition:background .15s,border-color .15s}
input:focus{outline:none;background:var(--panel);border-color:var(--accent)}
input.wrong{border-color:var(--danger);background:#fdecee}
.done{text-align:center;background:var(--panel);border-radius:24px;padding:52px 64px;box-shadow:0 4px 16px rgba(2,32,71,.08)}
.done .big{font-size:56px;margin-bottom:14px}
.done h2{margin-bottom:8px;font-size:24px;font-weight:800;letter-spacing:-.02em}
.done p{color:var(--sub);margin-bottom:24px;font-size:15px}
.shake{animation:shake .3s}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
</style>
</head>
<body>
<header><h1 id="title"></h1><span class="count" id="count"></span></header>
<div class="progress"><i id="bar" style="width:0"></i></div>
<main id="main"></main>
<footer id="footer"></footer>
<script type="application/json" id="data">${json}</script>
<script>
(function(){
var DATA=JSON.parse(document.getElementById('data').textContent);
var LABELS={click:'클릭',doubleclick:'더블클릭',rightclick:'우클릭',type:'입력',scroll:'스크롤',info:'안내'};
var HINTS={click:'강조된 영역을 클릭하세요',doubleclick:'강조된 영역을 더블클릭하세요',rightclick:'강조된 영역을 우클릭하세요',type:'텍스트를 입력하고 Enter를 누르세요',scroll:'강조된 영역에서 스크롤하세요',info:'내용을 확인하고 다음으로 진행하세요'};
var idx=0;
var steps=DATA.steps;
document.getElementById('title').textContent=DATA.title;
document.title=DATA.title;

function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML}

function advance(){if(idx<steps.length){idx++;render();}}
function back(){if(idx>0){idx--;render();}}

document.addEventListener('keydown',function(e){
  if(e.key==='ArrowRight'&&document.activeElement.tagName!=='INPUT')advance();
  if(e.key==='ArrowLeft'&&document.activeElement.tagName!=='INPUT')back();
});

function render(){
  var main=document.getElementById('main');
  var footer=document.getElementById('footer');
  document.getElementById('bar').style.width=(idx/steps.length*100)+'%';
  if(idx>=steps.length){
    document.getElementById('count').textContent='완료';
    main.innerHTML='<div class="done"><div class="big">🎉</div><h2>튜토리얼 완료!</h2><p>'+steps.length+'개 스텝을 모두 마쳤습니다.</p><button id="restart">처음부터 다시</button></div>';
    footer.innerHTML='';
    document.getElementById('restart').onclick=function(){idx=0;render();};
    return;
  }
  var s=steps[idx];
  document.getElementById('count').textContent=(idx+1)+' / '+steps.length;
  var boxHtml='';
  if(s.box){
    var cls='box'+((s.action==='click'||s.action==='doubleclick'||s.action==='rightclick')?' click':'');
    boxHtml='<div class="'+cls+'" id="box" style="left:'+(s.box.x*100)+'%;top:'+(s.box.y*100)+'%;width:'+(s.box.w*100)+'%;height:'+(s.box.h*100)+'%"></div>';
  }
  main.innerHTML='<div class="wrap"><img src="'+s.image+'" draggable="false" />'+boxHtml+'</div>';
  var needNextBtn=(s.action==='info'||s.action==='scroll'||!s.box);
  footer.innerHTML='<span class="badge">'+LABELS[s.action]+'</span>'
    +'<div class="cap"><div class="desc">'+esc(s.description||HINTS[s.action])+'</div>'
    +(s.description?'<div class="hint">'+HINTS[s.action]+'</div>':'')+'</div>'
    +(s.action==='type'?'<span><input id="ti" placeholder="'+esc(s.typeText||'텍스트 입력 후 Enter')+'" /></span>':'')
    +'<button id="prev" '+(idx===0?'disabled':'')+'>← 이전</button>'
    +(needNextBtn?'<button id="next" class="primary">다음 →</button>':'<button id="next">건너뛰기</button>');
  document.getElementById('prev').onclick=back;
  document.getElementById('next').onclick=advance;
  var box=document.getElementById('box');
  if(box){
    if(s.action==='click')box.addEventListener('click',advance);
    if(s.action==='doubleclick')box.addEventListener('dblclick',advance);
    if(s.action==='rightclick')box.addEventListener('contextmenu',function(e){e.preventDefault();advance();});
    if(s.action==='scroll')box.addEventListener('wheel',function(){advance();},{passive:true});
  }
  var ti=document.getElementById('ti');
  if(ti){
    ti.focus();
    ti.addEventListener('keydown',function(e){
      if(e.key!=='Enter')return;
      var expected=(s.typeText||'').trim();
      if(expected&&ti.value.trim()!==expected){ti.classList.add('wrong','shake');setTimeout(function(){ti.classList.remove('shake')},350);return;}
      if(!ti.value.trim()){ti.classList.add('wrong','shake');setTimeout(function(){ti.classList.remove('shake')},350);return;}
      advance();
    });
    ti.addEventListener('input',function(){ti.classList.remove('wrong')});
  }
}
render();
})();
</script>
</body>
</html>`;
  downloadBlob(
    sanitizeFilename(project.title) + '.html',
    new Blob([html], { type: 'text/html;charset=utf-8' }),
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
