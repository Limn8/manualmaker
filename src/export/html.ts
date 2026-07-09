import type { Project } from '../types';
import { DEFAULT_BOX_COLOR, DEFAULT_BOX_SHAPE, DEFAULT_INFO_DELAY_SEC } from '../types';
import { downloadBlob, sanitizeFilename } from '../utils';

/**
 * Generates a fully self-contained interactive HTML file:
 * images embedded as data URLs, viewer logic inlined, no external requests.
 * The highlight box animates its position between steps, a corner tag shows
 * the action, and a bottom thumbnail dashboard lets the viewer jump around.
 */
export async function exportHtml(project: Project): Promise<void> {
  const json = JSON.stringify(project).replace(/</g, '\\u003c');
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(project.title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
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
.wrap img{display:block;max-width:100%;max-height:calc(100vh - 320px);border-radius:14px;box-shadow:0 4px 16px rgba(2,32,71,.08);user-select:none;transition:opacity .3s}
.box{position:absolute;border:3px solid var(--accent);border-radius:6px;opacity:0;animation:pulse 1.5s ease-in-out infinite;will-change:left,top,width,height}
.box.click{cursor:pointer}
.box-tag{position:absolute;top:100%;right:0;margin-top:7px;display:inline-flex;align-items:center;gap:5px;background:var(--accent);color:#fff;font-size:12px;font-weight:700;padding:4px 9px;border-radius:8px;white-space:nowrap;box-shadow:0 4px 12px rgba(49,130,246,.35);pointer-events:none}
.box-tag svg{display:block}
@keyframes pulse{0%,100%{box-shadow:0 0 0 4px rgba(49,130,246,.22),0 0 20px rgba(49,130,246,.35)}50%{box-shadow:0 0 0 9px rgba(49,130,246,.1),0 0 32px rgba(49,130,246,.5)}}
footer{background:var(--panel);padding:16px 24px;display:flex;align-items:center;gap:14px;flex-shrink:0;min-height:80px;border-top:1px solid var(--fill)}
.badge{display:inline-flex;align-items:center;gap:5px;background:var(--tint);color:var(--accent);font-size:12px;font-weight:700;padding:4px 11px;border-radius:8px;flex-shrink:0}
.badge svg{display:block}
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
.dash{display:flex;gap:8px;padding:12px 16px;overflow-x:auto;background:var(--panel);border-top:1px solid var(--fill);flex-shrink:0}
.dash-item{position:relative;flex-shrink:0;width:104px;height:60px;padding:0;border-radius:10px;overflow:hidden;background:var(--fill);box-shadow:inset 0 0 0 2px transparent;transition:box-shadow .15s,transform .08s}
.dash-item img{width:100%;height:100%;object-fit:cover;display:block}
.dash-item span{position:absolute;left:5px;top:5px;background:rgba(25,31,40,.72);color:#fff;font-size:11px;font-weight:700;border-radius:6px;padding:1px 6px}
.dash-item.active{box-shadow:inset 0 0 0 2.5px var(--accent)}
.dash-item:hover{transform:translateY(-2px)}
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
<main id="main">
  <div class="wrap" id="wrap"><img id="img" draggable="false" /><div class="box" id="box"></div></div>
  <div class="done" id="done" style="display:none"></div>
</main>
<footer id="footer"></footer>
<div class="dash" id="dash"></div>
<script type="application/json" id="data">${json}</script>
<script>
(function(){
var DATA=JSON.parse(document.getElementById('data').textContent);
var LABELS={click:'클릭',doubleclick:'더블클릭',rightclick:'우클릭',type:'텍스트 입력',scroll:'스크롤',info:'안내'};
var HINTS={click:'강조된 영역을 클릭하세요',doubleclick:'강조된 영역을 더블클릭하세요',rightclick:'강조된 영역을 우클릭하세요',type:'텍스트를 입력하고 Enter를 누르세요',scroll:'강조된 영역에서 스크롤하세요',info:'내용을 확인하고 다음으로 진행하세요'};
var ICONS={click:'<path d="M5 3v16l4-4 3 6 2-1-3-6h6z"/>',doubleclick:'<path d="M5 3v16l4-4 3 6 2-1-3-6h6z"/>',rightclick:'<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v8"/>',type:'<path d="M6 7V5h12v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',scroll:'<path d="M12 4v16"/><path d="M7 9l5-5 5 5"/><path d="M7 15l5 5 5-5"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6h0"/>'};
var TRANS='left .45s cubic-bezier(.22,1,.36,1),top .45s cubic-bezier(.22,1,.36,1),width .45s cubic-bezier(.22,1,.36,1),height .45s cubic-bezier(.22,1,.36,1),opacity .3s';
var DEFAULT_BOX_COLOR='${DEFAULT_BOX_COLOR}',DEFAULT_BOX_SHAPE='${DEFAULT_BOX_SHAPE}',DEFAULT_INFO_DELAY_SEC=${DEFAULT_INFO_DELAY_SEC};
function icon(a,sz){return '<svg width="'+(sz||13)+'" height="'+(sz||13)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+ICONS[a]+'</svg>';}
function boxRadius(shape){return shape==='circle'?'999px':shape==='rounded'?'12px':'2px';}

var idx=0, prevBox=false, boxUnbind=null, infoTimer=null;
var steps=DATA.steps;
var img=document.getElementById('img'), box=document.getElementById('box');
var wrap=document.getElementById('wrap'), doneEl=document.getElementById('done');
var footer=document.getElementById('footer'), dash=document.getElementById('dash');
document.getElementById('title').textContent=DATA.title;
document.title=DATA.title;

function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML}
function advance(){if(idx<steps.length){idx++;render();}}
function back(){if(idx>0){idx--;render();}}
function clearInfoTimer(){if(infoTimer){clearTimeout(infoTimer);infoTimer=null;}}

// build dashboard once
steps.forEach(function(s,i){
  var b=document.createElement('button');
  b.className='dash-item';
  b.innerHTML='<img src="'+s.image+'" /><span>'+(i+1)+'</span>';
  b.onclick=function(){idx=i;render();};
  dash.appendChild(b);
});
function setActiveDash(active){
  for(var i=0;i<dash.children.length;i++){
    if(i===active){dash.children[i].classList.add('active');dash.children[i].scrollIntoView({block:'nearest',inline:'nearest'});}
    else dash.children[i].classList.remove('active');
  }
}

function bindBox(s){
  if(boxUnbind){boxUnbind();boxUnbind=null;}
  var hs=[];
  function on(ev,fn,opt){box.addEventListener(ev,fn,opt);hs.push([ev,fn,opt]);}
  if(s.action==='click')on('click',advance);
  else if(s.action==='doubleclick')on('dblclick',advance);
  else if(s.action==='rightclick')on('contextmenu',function(e){e.preventDefault();advance();});
  else if(s.action==='scroll')on('wheel',function(){advance();},{passive:true});
  boxUnbind=function(){hs.forEach(function(h){box.removeEventListener(h[0],h[1],h[2]);});};
}

document.addEventListener('keydown',function(e){
  if(e.key==='ArrowRight'&&document.activeElement.tagName!=='INPUT')advance();
  if(e.key==='ArrowLeft'&&document.activeElement.tagName!=='INPUT')back();
});

function render(){
  clearInfoTimer();
  document.getElementById('bar').style.width=(idx/steps.length*100)+'%';
  if(idx>=steps.length){
    document.getElementById('count').textContent='완료';
    wrap.style.display='none';
    box.style.opacity='0';prevBox=false;
    if(boxUnbind){boxUnbind();boxUnbind=null;}
    doneEl.style.display='block';
    doneEl.innerHTML='<div class="big">🎉</div><h2>매뉴얼 완료!</h2><p>'+steps.length+'개 단계를 모두 마쳤습니다.</p><button id="restart" class="primary">처음부터 다시</button>';
    document.getElementById('restart').onclick=function(){idx=0;render();};
    footer.innerHTML='';
    setActiveDash(-1);
    return;
  }
  var s=steps[idx];
  var color=s.boxColor||DEFAULT_BOX_COLOR;
  var shape=s.boxShape||DEFAULT_BOX_SHAPE;
  var infoDelay=s.infoDelaySec||DEFAULT_INFO_DELAY_SEC;
  var hint=s.action==='info'?infoDelay+'초 뒤 다음 단계로 넘어갑니다':HINTS[s.action];
  doneEl.style.display='none';
  wrap.style.display='';
  document.getElementById('count').textContent=(idx+1)+' / '+steps.length;

  // image (crossfade only when it actually changes)
  if(img.getAttribute('src')!==s.image){
    img.style.opacity='0';
    var tmp=new Image();
    tmp.onload=function(){img.setAttribute('src',s.image);requestAnimationFrame(function(){img.style.opacity='1';});};
    tmp.src=s.image;
  }else{img.style.opacity='1';}

  // box (animate position between steps)
  if(s.box){
    var clickable=(s.action==='click'||s.action==='doubleclick'||s.action==='rightclick');
    box.style.transition=prevBox?TRANS:'opacity .3s';
    box.style.left=(s.box.x*100)+'%';
    box.style.top=(s.box.y*100)+'%';
    box.style.width=(s.box.w*100)+'%';
    box.style.height=(s.box.h*100)+'%';
    box.style.borderColor=color;
    box.style.borderRadius=boxRadius(shape);
    box.className='box'+(clickable?' click':'');
    box.innerHTML=s.showBoxLabel===false?'':'<span class="box-tag" style="background:'+esc(color)+'">'+icon(s.action,13)+'<span>'+LABELS[s.action]+'</span></span>';
    box.style.opacity='1';
    bindBox(s);
    prevBox=true;
  }else{
    box.style.opacity='0';
    if(boxUnbind){boxUnbind();boxUnbind=null;}
    prevBox=false;
  }

  // footer
  var needNext=(s.action==='info'||s.action==='scroll'||!s.box);
  footer.innerHTML='<span class="badge">'+icon(s.action,13)+esc(LABELS[s.action])+'</span>'
    +'<div class="cap"><div class="desc">'+esc(s.description||hint)+'</div>'
    +(s.description?'<div class="hint">'+esc(hint)+'</div>':'')+'</div>'
    +(s.action==='type'?'<span><input id="ti" placeholder="'+esc(s.typeText||'텍스트 입력 후 Enter')+'" /></span>':'')
    +'<button id="prev" '+(idx===0?'disabled':'')+'>← 이전</button>'
    +(needNext?'<button id="next" class="primary">다음 →</button>':'<button id="next">건너뛰기</button>');
  document.getElementById('prev').onclick=back;
  document.getElementById('next').onclick=advance;
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
  if(s.action==='info') infoTimer=setTimeout(advance, infoDelay*1000);
  setActiveDash(idx);
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

