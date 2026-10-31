(() => {
'use strict';
const API=window.RoCodeAPI, LC=window.LuauCompiler;
const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initial=[
 {id:'main',name:'Main.server.luau',type:'Script',code:`--!strict
-- Welcome to Luau Studio ✨
-- Your next great experience starts here.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Set up a little welcome for every player
local function onPlayerAdded(player: Player)
    print("Welcome to the game, " .. player.Name .. "!")

    player.CharacterAdded:Connect(function(character)
        print(player.Name .. " spawned in!")
    end)
end

Players.PlayerAdded:Connect(onPlayerAdded)

-- Let's build something amazing.
print("Game initialized successfully!")`},
 {id:'client',name:'Player.client.luau',type:'LocalScript',code:`-- Client-side player script
local Players = game:GetService("Players")
local player = Players.LocalPlayer

print("Hello, " .. player.Name .. "!")`},
 {id:'module',name:'GameConfig.luau',type:'ModuleScript',code:`-- Shared game configuration
local GameConfig = {
    StartingCoins = 100,
    WalkSpeed = 16,
    WelcomeMessage = "Welcome to the game!",
}

return GameConfig`}
];
const key='luau-studio-projects-v2', oldKey='luau-studio-workspace-v1'; let files,active,openTabs,projects,projectId,storageAvailable=true;
function validWorkspace(p){return p&&Array.isArray(p.files)&&p.files.length&&p.files.every(f=>typeof f.id==='string'&&typeof f.code==='string'&&typeof f.name==='string')}
try{
 const saved=JSON.parse(localStorage.getItem(key));
 if(saved&&Array.isArray(saved.projects)){projects=saved.projects.filter(p=>typeof p.id==='string'&&typeof p.name==='string'&&validWorkspace(p));projectId=saved.projectId}
 if(!projects?.length){const old=JSON.parse(localStorage.getItem(oldKey));const source=validWorkspace(old)?old:{files:initial,active:'main',openTabs:['main','client','module']};projects=[{id:'default',name:'My Roblox Project',...source}];projectId='default'}
}catch(e){storageAvailable=false}
if(!projects?.length){projects=[{id:'default',name:'My Roblox Project',files:initial,active:'main',openTabs:['main','client','module']}];projectId='default'}
function loadProject(p){projectId=p.id;files=p.files;active=files.some(f=>f.id===p.active)?p.active:files[0].id;openTabs=Array.isArray(p.openTabs)?p.openTabs.filter(id=>files.some(f=>f.id===id)):[];if(!openTabs.includes(active))openTabs.push(active)}
loadProject(projects.find(p=>p.id===projectId)||projects[0]);
let analysis={diagnostics:[],symbols:[]},panelMode='problems',suggestions=[],suggestIndex=0,suggestRange=null,toastTimer,output=[],runtimeDiagnostics=[],compilerDiagnostics=[],runWorker=null,runTimer=null,runPending=false,runSequence=0,checkWorker=null,checkTimer=null,checkTimeout=null,checkSequence=0,previewWorker=null;
const editor=$('editor');
const defaultSettings={autoPairs:true,autoIndent:true,wordWrap:false,autoSuggest:true,lineNumbers:true,winduiCompat:false,tabSize:4,fontSize:12,runTimeout:30};
let settings={...defaultSettings};try{const raw=JSON.parse(localStorage.getItem('luau-studio-editor-settings-v1')||'{}');for(const k of ['autoPairs','autoIndent','wordWrap','autoSuggest','lineNumbers','winduiCompat'])if(typeof raw[k]==='boolean')settings[k]=raw[k];if([2,4,8].includes(raw.tabSize))settings.tabSize=raw.tabSize;if([12,14,16,18].includes(raw.fontSize))settings.fontSize=raw.fontSize;if([0,10,30,120,300].includes(raw.runTimeout))settings.runTimeout=raw.runTimeout}catch(_){}
const histories=new Map();let historyKey=null,historyApplying=false,lastTyping=null,lineOffsets=[];
function snapshot(){return {text:editor.value,start:editor.selectionStart,end:editor.selectionEnd}}
function activateHistory(){historyKey=projectId+'::'+active;const h=histories.get(historyKey);if(!h||h.entries[h.index].text!==editor.value)histories.set(historyKey,{entries:[snapshot()],index:0});lastTyping=null;updateHistoryButtons()}
function historyPrepare(){if(historyApplying||!historyKey)return;const h=histories.get(historyKey);if(h&&h.entries[h.index].text===editor.value){h.entries[h.index].start=editor.selectionStart;h.entries[h.index].end=editor.selectionEnd}}
function historyRecord(kind='edit',data=''){if(historyApplying||!historyKey)return;const h=histories.get(historyKey);if(!h)return;const value=snapshot(),prev=h.entries[h.index];if(prev.text===value.text){updateHistoryButtons();return}const now=Date.now();const grouping=kind==='insertText'&&data&&!/\s/.test(data)&&lastTyping&&lastTyping.kind===kind&&now-lastTyping.time<700&&lastTyping.caret===prev.start&&prev.start===prev.end&&h.index===h.entries.length-1;
 h.entries.splice(h.index+1);if(grouping){h.entries[h.index]=value}else{h.entries.push(value);h.index++;}lastTyping=kind==='insertText'&&data&&!/\s/.test(data)?{kind,time:now,caret:value.end}:null;
 let bytes=h.entries.reduce((sum,item)=>sum+item.text.length*2,0);while(h.entries.length>100||(bytes>8*1024*1024&&h.entries.length>2)){bytes-=h.entries[0].text.length*2;h.entries.shift();h.index--}updateHistoryButtons()}
function updateHistoryButtons(){const h=histories.get(historyKey);$('undoBtn').disabled=!h||h.index===0;$('redoBtn').disabled=!h||h.index>=h.entries.length-1}
function historyMove(direction){const h=histories.get(historyKey);if(!h)return;historyPrepare();const index=h.index+direction;if(index<0||index>=h.entries.length)return;h.index=index;const state=h.entries[index];historyApplying=true;editor.value=state.text;editor.focus();editor.setSelectionRange(state.start,state.end);lastTyping=null;hideSuggestions();change();historyApplying=false;updateHistoryButtons()}
function applySettings(){const area=$('editorScroll');area.classList.toggle('wrapped',settings.wordWrap);area.classList.toggle('hide-line-numbers',!settings.lineNumbers);area.style.setProperty('--editor-font-size',settings.fontSize+'px');area.style.setProperty('--editor-line-height',(settings.fontSize+13)+'px');area.style.setProperty('--editor-tab-size',settings.tabSize);editor.wrap=settings.wordWrap?'soft':'off';$('tabSizeStatus').textContent='Spaces: '+settings.tabSize;if(settings.wordWrap)area.scrollLeft=0;if(!settings.autoSuggest)hideSuggestions();try{localStorage.setItem('luau-studio-editor-settings-v1',JSON.stringify(settings))}catch(_){}renderEditor()}

function current(){return files.find(f=>f.id===active)}
function icon(type){return type==='ModuleScript'?'module':type==='LocalScript'?'client':type==='ExploitScript'?'exploit':''}
function save(){const project=projects.find(p=>p.id===projectId);if(project)Object.assign(project,{files,active,openTabs});try{localStorage.setItem(key,JSON.stringify({projects,projectId}));storageAvailable=true;$('saveStatus').innerHTML='<span>✓</span> All changes saved'}catch(e){storageAvailable=false;$('saveStatus').textContent='Changes not saved locally'}}
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2200)}
function renderFiles(){ const project=projects.find(p=>p.id===projectId);$('projectName').textContent=project.name;$('sidebarProjectName').textContent=project.name;$('breadcrumbProject').textContent=project.name;$('fileCount').textContent=files.length;$('fileList').innerHTML=files.map(f=>`<button class="file-item ${f.id===active?'active':''}" data-file="${escape(f.id)}"><span class="file-icon ${icon(f.type)}">▣</span><span class="file-name">${escape(f.name)}</span><span class="file-delete" data-delete="${escape(f.id)}" title="Delete script" aria-label="Delete ${escape(f.name)}">×</span></button>`).join('');$('tabs').innerHTML=openTabs.map(id=>files.find(f=>f.id===id)).filter(Boolean).map(f=>`<button class="tab ${f.id===active?'active':''}" data-tab="${escape(f.id)}"><span class="file-icon ${icon(f.type)}">▣</span><span class="name">${escape(f.name)}</span><span class="x" data-close="${escape(f.id)}" aria-label="Close tab">×</span></button>`).join('');$('breadcrumbFile').textContent=current().name;$('scriptTypeStatus').textContent=current().type==='ExploitScript'?'Executor script':current().type;}
function switchFile(id){if(!files.some(f=>f.id===id))return;historyPrepare();active=id;runtimeDiagnostics=[];compilerDiagnostics=[];if(!openTabs.includes(id))openTabs.push(id);editor.value=current().code;editor.setSelectionRange(0,0);activateHistory();$('editorScroll').scrollTop=0;$('editorScroll').scrollLeft=0;hideSuggestions();renderFiles();renderEditor();scheduleCompile();save();$('sidebar').classList.remove('open')}
function cursor(){const before=editor.value.slice(0,editor.selectionStart),lines=before.split('\n');return {line:lines.length,col:lines[lines.length-1].length+1}}
let colorLiterals=[],colorSnapshot='',colorCacheKey='';
function renderColors(code){
 const cacheKey=projectId+'::'+active+'::'+code;if(cacheKey===colorCacheKey)return;
 colorCacheKey=cacheKey;colorSnapshot=code;colorLiterals=LC.findColorLiterals(code);
 $('colorStrip').hidden=!colorLiterals.length;
 $('colorList').innerHTML=colorLiterals.slice(0,60).map((c,i)=>`<div class="color-chip"><input type="color" value="${c.hex}" data-color="${i}" aria-label="Change ${c.kind} color on line ${c.line}" title="Change color on line ${c.line}"><button type="button" data-color-jump="${i}" title="Go to line ${c.line}">${c.hex.toUpperCase()} <span>· ${c.line}</span></button></div>`).join('')+(colorLiterals.length>60?`<span class="color-more">+${colorLiterals.length-60} more</span>`:'');
}
function rgbToHsv(rgb){const [r,g,b]=rgb.map(x=>x/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d){if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h=(h/6+1)%1}return [h,max===0?0:d/max,max]}
$('colorList').addEventListener('click',e=>{const button=e.target.closest('[data-color-jump]');if(!button)return;const c=colorLiterals[+button.dataset.colorJump];if(!c)return;editor.focus();editor.setSelectionRange(c.start,c.end);$('editorScroll').scrollTop=Math.max(0,(lineOffsets[c.line-1]||0)-2*(settings.fontSize+13));renderEditor()});
$('colorList').addEventListener('change',e=>{if(!e.target.matches('input[data-color]'))return;const c=colorLiterals[+e.target.dataset.color],value=e.target.value;if(!c||editor.value!==colorSnapshot||!/^#[0-9a-f]{6}$/i.test(value)){toast('Color changed while editing; try again');return}const rgb=[1,3,5].map(i=>parseInt(value.slice(i,i+2),16));let replacement;
 if(c.kind==='fromHex'||c.kind==='hexString'){const quote=c.raw[0],prefix=c.raw[1]==='#'?'#':'';replacement=quote+prefix+value.slice(1).toUpperCase()+quote}
 else if(c.kind==='fromRGB')replacement=rgb.join(', ');
 else if(c.kind==='new')replacement=rgb.map(n=>String(Number((n/255).toFixed(4)))).join(', ');
 else replacement=rgbToHsv(rgb).map(n=>String(Number(n.toFixed(4)))).join(', ');
 replaceSelection(replacement,c.editStart,c.editEnd);toast('Color updated');
});
function renderEditor(){const code=editor.value;renderColors(code);try{analysis=LC.analyzeLuau(code,{scriptClassName:current().type==='ExploitScript'?'LocalScript':current().type})}catch(e){analysis={diagnostics:[{severity:'info',line:1,col:1,message:'Could not analyze this file. Check the syntax and try again.'}],symbols:[]};console.error(e)}
 analysis.diagnostics=analysis.diagnostics.filter(d=>d.severity!=='error');analysis.diagnostics.push(...compilerDiagnostics,...runtimeDiagnostics.filter(r=>!compilerDiagnostics.some(c=>c.severity==='error'&&c.line===r.line)));const pos=cursor(),lines=code.split('\n'),diag=analysis.diagnostics,scroll=$('editorScroll'),area=document.querySelector('.code-area'),highlight=$('highlight'),measure=$('lineMeasure'),gutter=$('gutter');highlight.innerHTML=LC.highlightLuau(code,diag,colorLiterals);
 let heights,lh=settings.fontSize+13;
 if(settings.wordWrap){area.style.width='';const fragment=document.createDocumentFragment();for(const line of lines){const d=document.createElement('div');d.textContent=line||'\u200b';fragment.appendChild(d)}measure.replaceChildren(fragment);heights=Array.from(measure.children,el=>el.getBoundingClientRect().height||lh)}
 else{measure.replaceChildren();area.style.width='0px';area.style.width=Math.max(highlight.scrollWidth,scroll.clientWidth-gutter.getBoundingClientRect().width)+'px';heights=lines.map(()=>lh)}
 lineOffsets=[];let total=0;for(const height of heights){lineOffsets.push(total);total+=height}
 gutter.innerHTML=lines.map((_,i)=>{let d=diag.find(x=>x.line===i+1&&x.severity==='error')||diag.find(x=>x.line===i+1&&x.severity==='warning');return `<div style="height:${heights[i]}px" class="${d?(d.severity==='error'?'err':'warn'):pos.line===i+1?'current':''}">${i+1}</div>`}).join('');
 $('lineBackgrounds').innerHTML=lines.map((_,i)=>{let d=diag.find(x=>x.line===i+1&&x.severity==='error')||diag.find(x=>x.line===i+1&&x.severity==='warning');return `<div style="height:${heights[i]}px" class="${d?(d.severity==='error'?'error':'warning'):pos.line===i+1?'current':''}"></div>`}).join('');
 editor.style.height=Math.max(total+2,scroll.clientHeight-23)+'px';$('cursorPos').textContent=`Ln ${pos.line}, Col ${pos.col}`;const errors=diag.filter(d=>d.severity==='error').length,warnings=diag.filter(d=>d.severity==='warning').length;$('problemCount').textContent=diag.length;$('statusErrors').textContent=errors;$('statusWarnings').textContent=warnings;renderPanel()}

function renderPanel(){ $('problemsTab').classList.toggle('active',panelMode==='problems');$('outputTab').classList.toggle('active',panelMode==='output'); if(panelMode==='output'){$('panelBody').innerHTML=output.length?output.map(o=>`<div class="output-line ${escape(o.level||'')}"><span class="time">${escape(o.time)}</span>${escape(o.message)}</div>`).join(''):'<div class="empty-state"><div class="empty-icon">›_</div><div><strong>Output is quiet</strong><p>Run a script to see its output here.</p></div></div>';return}const d=analysis.diagnostics;if(!d.length){$('panelBody').innerHTML='<div class="empty-state"><div class="empty-icon">✓</div><div><strong>Looking good!</strong><p>No problems have been detected in this file.</p></div></div>';return}$('panelBody').innerHTML=d.slice().sort((a,b)=>a.line-b.line||a.col-b.col).map(x=>`<button class="problem ${escape(x.severity)}" data-line="${x.line}" data-col="${x.col}"><span class="p-icon">${x.severity==='error'?'⊗':x.severity==='warning'?'⚠':'ⓘ'}</span><span>${escape(x.message)}</span><span class="p-location">${escape(current().name)} [${x.line}, ${x.col}]</span></button>`).join('')}
function change(kind='edit',data=''){historyRecord(kind,data);runtimeDiagnostics=[];compilerDiagnostics=[];current().code=editor.value;renderEditor();scheduleCompile();save()}
function setPanel(mode){panelMode=mode;$('panel').classList.remove('collapsed');renderPanel()}
function goLine(line,col=1){const lines=editor.value.split('\n');let n=0;for(let i=0;i<Math.min(line-1,lines.length);i++)n+=lines[i].length+1;n+=Math.max(0,Math.min(col-1,(lines[line-1]||'').length));editor.focus();editor.setSelectionRange(n,n);$('editorScroll').scrollTop=Math.max(0,(lineOffsets[Math.max(0,line-1)]||0)-2*(settings.fontSize+13));renderEditor()}
function replaceSelection(text,start=editor.selectionStart,end=editor.selectionEnd,selectStart=null,selectEnd=null){editor.focus();historyPrepare();editor.setRangeText(text,start,end,'end');if(selectStart!==null)editor.setSelectionRange(start+selectStart,start+(selectEnd===null?selectStart:selectEnd));change()}
function hideSuggestions(){$('suggestions').hidden=true;suggestions=[];suggestRange=null}
function getSuggestions(force=false){if(!force&&!settings.autoSuggest){hideSuggestions();return}const pos=editor.selectionStart;if(editor.selectionEnd!==pos){hideSuggestions();return}const before=editor.value.slice(0,pos), line=before.slice(before.lastIndexOf('\n')+1);const member=line.match(/([\w]+)\s*([.:])\s*([\w]*)$/);const service=line.match(/\b(GetService|Instance\.new)\s*(?:\(\s*)?["']([^"']*)$/);const directService=line.match(/\b(?:game|Game)\s*:\s*GetService\s*(?:\(\s*["'](\w+)["']\s*\)|["'](\w+)["'])((?:\s*\.\s*\w+)*)\s*([.:])\s*(\w*)$/);let list=[],prefix='',start=pos;
 if(service){prefix=service[2];start=pos-prefix.length;const isService=service[1]==='GetService';list=(isService?API.SERVICES:API.CREATABLE_CLASSES).map(x=>({label:x.name,detail:x.detail,kind:isService?'service':'class',insertText:x.name}));}
 else if(directService){const [,parenthesized,bare,path,op,p]=directService;let type=parenthesized||bare;for(const name of (path.match(/\w+/g)||[])){const property=API.getClassMembers(type).properties.find(x=>x.label===name);const special={"Players.LocalPlayer":"Player","Player.Character":"Model","Player.PlayerGui":"PlayerGui","Player.Backpack":"Backpack"};type=special[type+'.'+name]||String(property?.type||'').replace(/\?$/,'');if(!API.CLASS_DEFS[type]){type='';break}}prefix=p;start=pos-prefix.length;if(type){const members=API.getClassMembers(type);list=op===':'?members.methods:[...members.properties,...members.events]}}
 else if(member){const [,object,op,p]=member;prefix=p;start=pos-p.length;if(object==='Enum'){list=Object.keys(API.ENUMS).map(x=>({label:x,kind:'enum',detail:'Roblox enumeration'}))}else if(API.ENUMS[object]&&/Enum\./.test(line)){list=API.ENUMS[object].map(x=>({label:x,kind:'enum',detail:`Enum.${object}`}))}else if(API.LIBRARIES[object]&&(!['syn','http','Drawing','bit'].includes(object)||current().type==='ExploitScript')){list=API.LIBRARIES[object]}else {const sym=analysis.symbols.find(s=>s.name===object);const type=object==='game'?'DataModel':object==='workspace'?'Workspace':object==='script'?current().type:sym?.inferredType;if(type){const m=API.getClassMembers(type);list=op===':'?m.methods:[...m.properties,...m.events];}if(!list.length&&op===':')list=API.getClassMembers('Instance').methods;}}
 else {const match=line.match(/([\w]*)$/);prefix=match?match[1]:'';start=pos-prefix.length;if(!prefix&&!force){hideSuggestions();return}list=[...analysis.symbols.map(s=>({label:s.name,kind:s.kind,detail:`${s.inferredType} · local`,insertText:s.name})),...API.GLOBALS,...(current().type==='ExploitScript'?API.EXECUTOR_GLOBALS:[]),...API.KEYWORDS.map(x=>({label:x,kind:'keyword',detail:'Luau keyword'})),...API.SNIPPETS.map(x=>({label:x.label,kind:'snippet',detail:x.detail,insertText:x.code}))]}
 const lower=prefix.toLowerCase();const seen=new Set();suggestions=list.filter(x=>x.label.toLowerCase().startsWith(lower)&&!(x.label===prefix&&!force)).filter(x=>{if(seen.has(x.label))return false;seen.add(x.label);return true}).slice(0,30);if(!suggestions.length){hideSuggestions();return}suggestIndex=0;suggestRange={start,end:pos};renderSuggestions();const box=$('suggestions'),scroll=$('editorScroll'),highlight=$('highlight');let remaining=pos,node;const walker=document.createTreeWalker(highlight,NodeFilter.SHOW_TEXT);while((node=walker.nextNode())){if(remaining<node.length)break;remaining-=node.length}let x=$('gutter').offsetWidth,y=23+(lineOffsets[cursor().line-1]||0),lh=settings.fontSize+13;if(node){const range=document.createRange();range.setStart(node,remaining);range.collapse(true);const rect=range.getBoundingClientRect(),outer=scroll.getBoundingClientRect();if(rect.height){x=rect.left-outer.left+scroll.scrollLeft;y=rect.top-outer.top+scroll.scrollTop-3}}box.hidden=false;const width=box.offsetWidth,height=Math.min(240,box.offsetHeight);box.style.left=Math.max(scroll.scrollLeft+5,Math.min(x,scroll.scrollLeft+scroll.clientWidth-width-5))+'px';box.style.top=(y+lh-scroll.scrollTop+height>scroll.clientHeight?Math.max(scroll.scrollTop+5,y-height):y+lh)+'px';}
function renderSuggestions(){$('suggestionList').innerHTML=suggestions.map((s,i)=>`<button class="suggestion ${i===suggestIndex?'active':''}" data-suggestion="${i}"><span class="kind">${s.kind==='function'||s.kind==='method'?'ƒ':s.kind==='snippet'?'✦':s.kind==='property'?'◇':'◈'}</span><span>${escape(s.label)}</span><small>${escape(s.detail||s.type||s.kind||'')}</small></button>`).join('')}
function insertSuggestion(i){const s=suggestions[i];if(!s||!suggestRange)return;let text=s.insertText||s.label;let first=null; text=text.replace(/\$\{(\d+):([^}]*)\}|\$(\d+)/g,(match,a,def,b,offset)=>{if(first===null)first={offset,def:def||''};return def||''});const range=suggestRange;hideSuggestions();replaceSelection(text,range.start,range.end,first?first.offset:null,first?first.offset+first.def.length:null)}
function showModal(title,eyebrow,html){$('modalTitle').textContent=title;$('modalEyebrow').textContent=eyebrow;$('modalContent').innerHTML=html;$('modal').hidden=false;setTimeout(()=>$('modalContent').querySelector('input,button')?.focus(),30)}
function hideModal(){$('modal').hidden=true}
function uniqueName(name){if(!files.some(f=>f.name.toLowerCase()===name.toLowerCase()))return name;const match=name.match(/^(.*?)(\.(?:server\.|client\.|exploit\.)?(?:luau|lua)|\.txt)?$/i),base=match[1],ext=match[2]||'';let n=2;while(files.some(f=>f.name.toLowerCase()===(base+' '+n+ext).toLowerCase()))n++;return base+' '+n+ext}
function newMenu(){showModal('Create something','YOUR WORKSPACE',`<button class="template-item" id="menuNewScript"><strong>＋ New script</strong><p>Create a Luau file in this project.</p></button><button class="template-item" id="menuNewProject"><strong>◇ New project</strong><p>Start a separate workspace. Your current project stays saved.</p></button><button class="template-item" id="menuProjects"><strong>▤ All projects</strong><p>Switch between your saved projects.</p></button>`);$('menuNewScript').onclick=newFile;$('menuNewProject').onclick=newProject;$('menuProjects').onclick=projectPicker}
function newProject(){showModal('New project','YOUR WORKSPACE',`<label class="form-label" for="newProjectName">Project name</label><input class="form-input" id="newProjectName" value="My new project" maxlength="80"><p class="form-hint">Projects are saved separately in this browser. Your other projects will not be deleted.</p><div class="modal-actions"><button class="top-button" id="cancelProject">Cancel</button><button class="primary-btn" id="createProject">Create project</button></div>`);$('cancelProject').onclick=hideModal;$('createProject').onclick=()=>{const name=$('newProjectName').value.trim();if(!name){$('newProjectName').focus();return}save();const id='p'+Date.now()+Math.random().toString(36).slice(2,6);const project={id,name,files:[{id:'main',name:'Main.server.luau',type:'Script',code:'-- Start writing your Luau script here.\n\n'}],active:'main',openTabs:['main']};projects.push(project);switchProject(id);hideModal();toast('Project created')};$('newProjectName').onkeydown=e=>{if(e.key==='Enter')$('createProject').click()}}
function projectPicker(){showModal('Your projects','LOCAL WORKSPACE',projects.map(p=>`<button class="template-item" data-project="${escape(p.id)}"><strong>${escape(p.name)} ${p.id===projectId?' · Current':''}</strong><p>${p.files.length} script${p.files.length===1?'':'s'} · Saved in this browser</p></button>`).join('')+`<div class="modal-actions"><button class="primary-btn" id="pickerNewProject">＋ New project</button></div>`);$('pickerNewProject').onclick=newProject}
function switchProject(id){const project=projects.find(p=>p.id===id);if(!project)return;save();if(runWorker||runPending)finishRun();if(previewWorker){discardNetworkPrompt(previewWorker);previewWorker.terminate();previewWorker=null}output=[];window.UIViewer.reset();loadProject(project);hideModal();switchFile(active)}
function newFile(){showModal('Create a script','YOUR WORKSPACE',`<label class="form-label" for="newName">Script name</label><input class="form-input" id="newName" value="NewScript" maxlength="80"><label class="form-label" for="newType">Script type</label><select class="form-input" id="newType"><option value="Script">Script · server</option><option value="LocalScript">LocalScript · client</option><option value="ModuleScript">ModuleScript · shared module</option><option value="ExploitScript">Exploit script · executor client</option></select><p class="form-hint">Executor scripts enable temporary mock executor APIs. The filesystem resets after every run.</p><div class="modal-actions"><button class="top-button" id="cancelNew">Cancel</button><button class="primary-btn" id="createNew">Create script</button></div>`);$('cancelNew').onclick=hideModal;$('createNew').onclick=()=>{let name=$('newName').value.trim();if(!name){$('newName').focus();return}let type=$('newType').value;if(!/\.(luau|lua)$/i.test(name))name+=type==='Script'?'.server.luau':type==='LocalScript'?'.client.luau':type==='ExploitScript'?'.exploit.luau':'.luau';name=uniqueName(name);const id='f'+Date.now()+Math.random().toString(36).slice(2,6);files.push({id,name,type,code:type==='ModuleScript'?'local module = {}\n\nreturn module':type==='ExploitScript'?'-- Executor script: available APIs depend on your executor.\n-- Browser Run uses temporary executor mocks, not a real executor.\n\nlocal Players = game:GetService("Players")\nlocal player = Players.LocalPlayer\n\nprint("Hello, " .. player.Name .. "!")\n':'-- '+name+'\n\n'});hideModal();switchFile(id);editor.focus();toast('Script created')};$('newName').addEventListener('keydown',e=>{if(e.key==='Enter')$('createNew').click()})}
function templates(){showModal('Start with a template','BUILD SOMETHING GREAT',API.TEMPLATES.map(t=>`<button class="template-item" data-template="${escape(t.id)}"><strong>${escape(t.title)}</strong><p>${escape(t.description)}</p><span>${escape(t.badge)} →</span></button>`).join(''));}
function help(){showModal('A little help','QUICK REFERENCE',`<div class="help-list"><div><kbd>Ctrl / ⌘ + Space</kbd> &nbsp; Show suggestions</div><div><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd> &nbsp; Choose a suggestion</div><div><kbd>Tab</kbd> &nbsp; Indent or accept a suggestion</div><div><kbd>Ctrl / ⌘ + F</kbd> &nbsp; Find in current file</div><div><kbd>Ctrl / ⌘ + S</kbd> &nbsp; Save to this browser</div><div><kbd>Ctrl / ⌘ + Z</kbd> &nbsp; Undo</div><div><kbd>Ctrl / ⌘ + Shift + Z</kbd> &nbsp; Redo</div><div><kbd>Ctrl / ⌘ + /</kbd> &nbsp; Toggle line comment</div><div><kbd>Shift + Tab</kbd> &nbsp; Outdent</div><div><kbd>Export</kbd> &nbsp; Download your current script</div><p>Diagnostics and API suggestions are helpful approximations, not the official Luau type checker. Run and test your scripts in Roblox Studio. Files are stored locally in this browser.</p></div>`)}
function find(){ $('findBox').hidden=false;$('findInput').focus();$('findInput').select()}
function findNext(){const query=$('findInput').value;if(!query)return;let index=editor.value.toLowerCase().indexOf(query.toLowerCase(),editor.selectionEnd);if(index<0)index=editor.value.toLowerCase().indexOf(query.toLowerCase());if(index<0){toast('No matches found');return}editor.focus();editor.setSelectionRange(index,index+query.length);const line=editor.value.slice(0,index).split('\n').length;$('editorScroll').scrollTop=Math.max(0,(lineOffsets[Math.max(0,line-1)]||0)-2*(settings.fontSize+13));renderEditor()}
$('fileList').addEventListener('click',e=>{const del=e.target.closest('[data-delete]');if(del){e.stopPropagation();const id=del.dataset.delete;const f=files.find(x=>x.id===id);if(files.length===1){toast('Keep at least one script in your workspace');return}if(!confirm(`Delete ${f.name}? This cannot be undone.`))return;files=files.filter(x=>x.id!==id);openTabs=openTabs.filter(x=>x!==id);if(active===id)switchFile(files[0].id);else{renderFiles();save()}return}const item=e.target.closest('[data-file]');if(item)switchFile(item.dataset.file)});
$('tabs').addEventListener('click',e=>{const close=e.target.closest('[data-close]');if(close){e.stopPropagation();const id=close.dataset.close;if(openTabs.length===1){toast('Keep one tab open');return}openTabs=openTabs.filter(x=>x!==id);if(id===active)switchFile(openTabs[openTabs.length-1]);else{renderFiles();save()}return}const tab=e.target.closest('[data-tab]');if(tab)switchFile(tab.dataset.tab)});
function indentSelection(outdent=false){
 const start=editor.selectionStart,end=editor.selectionEnd,text=editor.value,unit=' '.repeat(settings.tabSize);
 if(start===end&&!outdent){replaceSelection(unit);return}
 const first=text.lastIndexOf('\n',Math.max(0,start-1))+1;let last=text.indexOf('\n',end);if(end>first&&text[end-1]==='\n')last=end-1;if(last<0)last=text.length;
 const source=text.slice(first,last),lines=source.split('\n');let firstDelta=0,totalDelta=0;
 const adjusted=lines.map((line,i)=>{let result,delta;if(outdent){const match=line.match(/^(\t| +)/),n=match?(match[0][0]==='\t'?1:Math.min(settings.tabSize,match[0].length)):0;result=line.slice(n);delta=-n}else{result=unit+line;delta=unit.length}if(i===0)firstDelta=delta;totalDelta+=delta;return result}).join('\n');
 const newStart=Math.max(0,start-first+firstDelta),newEnd=Math.max(newStart,end-first+totalDelta);
 replaceSelection(adjusted,first,last,newStart,newEnd);
}
function toggleComment(){const start=editor.selectionStart,end=editor.selectionEnd,text=editor.value,first=text.lastIndexOf('\n',Math.max(0,start-1))+1;let last=text.indexOf('\n',end);if(end>first&&text[end-1]==='\n')last=end-1;if(last<0)last=text.length;const lines=text.slice(first,last).split('\n'),remove=lines.filter(l=>l.trim()).every(l=>/^\s*--/.test(l));let firstDelta=0,totalDelta=0;const result=lines.map((line,i)=>{let next;if(remove)next=line.replace(/^(\s*)-- ?/,'$1');else next=line.replace(/^(\s*)/,'$1-- ');const delta=next.length-line.length;if(i===0)firstDelta=delta;totalDelta+=delta;return next}).join('\n');const newStart=Math.max(0,start-first+firstDelta),newEnd=Math.max(newStart,end-first+totalDelta);replaceSelection(result,first,last,newStart,newEnd)}
function insertIndentedNewline(){const pos=editor.selectionStart,line=editor.value.slice(0,pos).split('\n').pop();let indent=(line.match(/^\s*/)||[''])[0],extra='';if((/\b(then|do|function)\b[^\n]*$/.test(line)&&!/\bend\s*\)?\s*$/.test(line))||/[{(\[]\s*$/.test(line))extra=' '.repeat(settings.tabSize);const next=editor.value.slice(editor.selectionEnd);if(extra&&/[{(\[]\s*$/.test(line)&&/^[})\]]/.test(next)){const text='\n'+indent+extra+'\n'+indent;replaceSelection(text,editor.selectionStart,editor.selectionEnd,1+indent.length+extra.length)}else replaceSelection('\n'+indent+extra);hideSuggestions()}
const pairs={'(':')','[':']','{':'}','"':'"',"'":"'",'`':'`'};
editor.addEventListener('beforeinput',e=>{
 if(e.inputType==='historyUndo'||e.inputType==='historyRedo'){if(e.cancelable){e.preventDefault();historyMove(e.inputType==='historyUndo'?-1:1)}return}
 historyPrepare();if(e.isComposing||!e.cancelable)return;
 if(settings.autoIndent&&(e.inputType==='insertLineBreak'||e.inputType==='insertParagraph')){e.preventDefault();insertIndentedNewline();return}
 if(!settings.autoPairs)return;
 const start=editor.selectionStart,end=editor.selectionEnd,text=editor.value,next=text[end],prev=text[start-1];
 if(e.inputType==='deleteContentBackward'&&start===end&&start>0&&pairs[prev]===next){e.preventDefault();replaceSelection('',start-1,end+1);return}
 if(e.inputType!=='insertText'||!e.data||e.data.length!==1)return;
 const char=e.data;
 if(start===end&&next===char&&Object.values(pairs).includes(char)&&prev!=='\\'){e.preventDefault();editor.setSelectionRange(start+1,start+1);lastTyping=null;renderEditor();return}
 if(!pairs[char])return;
 if(start===end&&next&&!/[\s)\]}>,;:]/.test(next))return;
 if((char==='"'||char==="'"||char==='`')&&start===end&&prev&&/[\w]/.test(prev))return;
 e.preventDefault();const selected=text.slice(start,end);replaceSelection(char+selected+pairs[char],start,end,1,1+selected.length);
});
editor.addEventListener('input',e=>{change(e.inputType||'edit',e.data||'');getSuggestions()});editor.addEventListener('click',()=>{lastTyping=null;hideSuggestions();renderEditor()});editor.addEventListener('keyup',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)&&$('suggestions').hidden){lastTyping=null;renderEditor()}});
editor.addEventListener('keydown',e=>{
 const mod=e.ctrlKey||e.metaKey;
 if(mod&&!e.altKey&&e.key.toLowerCase()==='z'){e.preventDefault();historyMove(e.shiftKey?1:-1);return}
 if(mod&&!e.altKey&&e.key.toLowerCase()==='y'){e.preventDefault();historyMove(1);return}
 if(mod&&e.key==='/'){e.preventDefault();toggleComment();return}
 if(mod&&e.code==='Space'){e.preventDefault();getSuggestions(true);return}
 if(!$('suggestions').hidden){if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();suggestIndex=(suggestIndex+(e.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length;renderSuggestions();$('suggestionList').children[suggestIndex]?.scrollIntoView({block:'nearest'});return}if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();insertSuggestion(suggestIndex);return}if(e.key==='Escape'){e.preventDefault();hideSuggestions();return}}
 if(e.key==='Tab'){e.preventDefault();indentSelection(e.shiftKey);return}
 if(e.key==='Enter'&&settings.autoIndent){e.preventDefault();insertIndentedNewline();return}
 if(e.key==='Escape')hideSuggestions();
});
$('suggestionList').addEventListener('mousedown',e=>e.preventDefault());$('suggestionList').addEventListener('click',e=>{const item=e.target.closest('[data-suggestion]');if(item)insertSuggestion(+item.dataset.suggestion)});
$('panelBody').addEventListener('click',e=>{const p=e.target.closest('[data-line]');if(p)goLine(+p.dataset.line,+p.dataset.col)});$('problemsTab').onclick=()=>setPanel('problems');$('outputTab').onclick=()=>setPanel('output');$('statusProblems').onclick=()=>setPanel('problems');$('collapsePanel').onclick=()=>$('panel').classList.toggle('collapsed');$('clearOutput').onclick=()=>{output=[];renderPanel()};
// Check deployment files instead of reporting a vague worker error. Paths are
// deliberately relative to the page, including on GitHub Pages subdirectories.
const compileFiles=['runtime/worker.js','vendor/luau-web/src/index.js','vendor/luau-web/src/lib/Luau.Web.Asyncify.js','vendor/luau-web/src/lib/Luau.Web.JSPI.js'];
const mockFiles=['runtime/mock.js','runtime/json.js','runtime/api-metadata.js','runtime/http.js'];
const verifiedRuntimeFiles=new Set();
async function verifyRuntime(files){
 const missing=files.filter(path=>!verifiedRuntimeFiles.has(path));
 const results=await Promise.all(missing.map(async path=>{
   try{
     let response=await fetch(new URL(path,document.baseURI),{method:'HEAD',cache:'no-cache'});
     if(response.status===405||response.status===501)response=await fetch(new URL(path,document.baseURI),{cache:'no-cache'});
     if(!response.ok)return {path,status:response.status};
     const type=response.headers.get('content-type')||'';
     if(type.includes('text/html'))return {path,status:'HTML instead of JavaScript'};
     return {path};
   }catch(e){return {path,status:'network error'};}
 }));
 for(const item of results)if(!item.status)verifiedRuntimeFiles.add(item.path);
 const failed=results.find(item=>item.status);
 if(failed)throw new Error('Missing or inaccessible '+failed.path+' ('+failed.status+'). Upload the complete runtime and vendor folders to GitHub.');
}
function setCompilerStatus(text){$('compilerState').innerHTML='<b>◈</b> Luau: '+escape(text)}
function stopCheckWorker(){if(checkWorker){checkWorker.terminate();checkWorker=null}if(checkTimeout){clearTimeout(checkTimeout);checkTimeout=null}}
function scheduleCompile(immediate=false,notify=false){
 const sequence=++checkSequence;clearTimeout(checkTimer);stopCheckWorker();compilerDiagnostics=[];setCompilerStatus('checking');
 checkTimer=setTimeout(()=>compileCurrent(sequence,notify),immediate?0:550);
}
async function compileCurrent(sequence,notify){
 const id=active,code=editor.value,name=current().name;
 try{
  await verifyRuntime(compileFiles);
  if(sequence!==checkSequence||id!==active||code!==editor.value)return;
  const worker=new Worker('runtime/worker.js',{type:'module'});checkWorker=worker;
  checkTimeout=setTimeout(()=>{if(checkWorker!==worker)return;stopCheckWorker();compilerDiagnostics=[{severity:'info',line:1,col:1,endCol:1,message:'Luau compiler timed out. Try again or check your deployment.'}];setCompilerStatus('unavailable');renderEditor();if(notify)toast('Compiler timed out')},10000);
  worker.onmessage=({data})=>{
   if(checkWorker!==worker||sequence!==checkSequence)return;
   stopCheckWorker();
   if(data.type==='compile-ok'){compilerDiagnostics=[];setCompilerStatus('ready');renderEditor();if(notify)toast('Luau syntax is valid');return}
   if(data.type==='compile-error'){
    const match=data.message.match(/\[string ["'].*?["']\]:(\d+):/);const line=match?Number(match[1]):1;
    compilerDiagnostics=[{severity:'error',line,col:1,endCol:999,message:'Luau compiler: '+data.message}];
    setCompilerStatus('error');renderEditor();if(notify)toast('Luau syntax error found');return
   }
   const message=data.message||'Compiler failed to start.';
   compilerDiagnostics=[{severity:'info',line:1,col:1,endCol:1,message:'Luau compiler unavailable: '+message}];setCompilerStatus('unavailable');renderEditor();if(notify)toast('Compiler unavailable');
  };
  worker.onerror=e=>{if(checkWorker!==worker||sequence!==checkSequence)return;stopCheckWorker();compilerDiagnostics=[{severity:'info',line:1,col:1,endCol:1,message:'Luau compiler could not start. Verify runtime and vendor files, then refresh.'}];setCompilerStatus('unavailable');renderEditor();if(notify)toast('Compiler unavailable')};
  worker.postMessage({type:'check',code,filename:name});
 }catch(e){
  if(sequence!==checkSequence||id!==active||code!==editor.value)return;
  compilerDiagnostics=[{severity:'info',line:1,col:1,endCol:1,message:'Luau compiler unavailable: '+e.message}];setCompilerStatus('unavailable');renderEditor();if(notify){appendOutput(e.message,'error');toast('Compiler unavailable')}
 }
}
function check(){runtimeDiagnostics=[];compilerDiagnostics=[];renderEditor();setPanel('problems');scheduleCompile(true,true)}
function format(){const result=LC.formatLuau(editor.value,' '.repeat(settings.tabSize));if(result===editor.value){toast('Already formatted');return}editor.focus();historyPrepare();editor.setRangeText(result,0,editor.value.length,'end');change();toast('Script formatted')}
function appendOutput(message, level='info'){output.push({time:new Date().toLocaleTimeString(),message,level});if(output.length>600)output.shift();if(panelMode==='output')renderPanel()}
let networkConsent=null,runDeadline=0;
function armRunTimeout(duration=settings.runTimeout*1000){clearTimeout(runTimer);runTimer=null;if(!duration){runDeadline=0;return}runDeadline=Date.now()+duration;runTimer=setTimeout(()=>{appendOutput('Execution stopped after reaching the time limit. Change the run timeout in Editor settings if needed.','warn');window.UIViewer.setStatus('Timed out. Preview is a snapshot.');finishRun()},duration)}
function discardNetworkPrompt(worker){if(networkConsent&&networkConsent.worker===worker){networkConsent=null;$('networkModal').hidden=true}}
function settleNetwork(allowed){const consent=networkConsent;if(!consent)return;networkConsent=null;$('networkModal').hidden=true;if(consent.kind==='asset-proxy'){if(allowed)window.UIViewer.enableThumbnailProxy();appendOutput(allowed?'RoProxy thumbnail fallback enabled for this run.':'RoProxy thumbnail fallback was not enabled.',allowed?'warn':'info');return}if(consent.kind==='images'){if(allowed)window.UIViewer.enableImages();appendOutput(allowed?'External UI images allowed for this run.':'External UI images were not loaded.',allowed?'warn':'info');return}consent.worker.postMessage({type:'http-permission',allowed});appendOutput(allowed?'Network access allowed for this run. Browser CORS and HTTPS rules still apply.':'Network access denied for this run.',allowed?'warn':'info');if(consent.worker===runWorker)armRunTimeout(consent.remaining)}
function promptNetwork(worker,data){if(networkConsent)return;const remaining=runTimer?Math.max(1,runDeadline-Date.now()):0;if(worker===runWorker){clearTimeout(runTimer);runTimer=null}networkConsent={kind:'http',worker,remaining};$('networkMethod').textContent=String(data.method);$('networkOrigin').textContent=String(data.origin);$('networkDescription').textContent='If allowed, this run and any code it downloads can make more requests to any website, not just this first address. Scripts can send data and POST requests can change remote services. Only allow scripts you trust.';$('networkModal').hidden=false;setTimeout(()=>$('denyNetwork').focus(),0)}
function promptImages(origins){if(networkConsent||!origins.length)return;networkConsent={kind:'images'};$('networkMethod').textContent='GET images';$('networkOrigin').textContent=origins.slice(0,4).join(', ')+(origins.length>4?' and more':'');$('networkDescription').textContent='If allowed, the viewer will load external images and public Roblox asset images for this run. Image hosts can see your IP address. Roblox asset images use your browser’s normal image requests, which may include browser cookies; referrer information is omitted. Only allow scripts you trust.';$('networkModal').hidden=false;setTimeout(()=>$('denyNetwork').focus(),0)}
function promptThumbnailProxy(){if(networkConsent)return;networkConsent={kind:'asset-proxy'};$('networkMethod').textContent='GET Roblox asset thumbnails';$('networkOrigin').textContent='https://thumbnails.roproxy.com (third-party)';$('networkDescription').textContent='RoProxy is an independent service, not Roblox or this editor. It will receive your IP address and the asset IDs requested by this UI. Only public thumbnails are returned; private or unavailable assets may still fail, and thumbnails may differ from the originals. Requests omit browser credentials.';$('networkModal').hidden=false;setTimeout(()=>$('denyNetwork').focus(),0)}
$('allowNetwork').onclick=()=>settleNetwork(true);$('denyNetwork').onclick=()=>settleNetwork(false);$('networkModal').onclick=e=>{if(e.target===$('networkModal'))settleNetwork(false)};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&networkConsent){e.stopImmediatePropagation();settleNetwork(false)}},true);
function finishRun(){window.UIViewer.setRunning(false);runPending=false;runSequence++;if(runTimer){clearTimeout(runTimer);runTimer=null}if(runWorker){discardNetworkPrompt(runWorker);runWorker.terminate();runWorker=null}$('runBtn').innerHTML='<span>▶</span> <span>Run</span>';$('runBtn').classList.remove('running');$('runBtn').title='Run Luau in the browser sandbox'}
async function runCode(){
 if(runWorker||runPending){finishRun();appendOutput('Stopped by user.','warn');window.UIViewer.setStatus('Execution stopped. Preview is a snapshot.');return}
 if(previewWorker){discardNetworkPrompt(previewWorker);previewWorker.terminate();previewWorker=null}window.UIViewer.reset('Running script…');
 runtimeDiagnostics=[];renderEditor();setPanel('output');
 const fileId=active, code=editor.value, filename=current().name, type=current().type;
 const sequence=++runSequence;runPending=true;window.UIViewer.setRunning(true);
 $('runBtn').innerHTML='<span>■</span> <span>Stop</span>';$('runBtn').classList.add('running');$('runBtn').title='Stop running script';
 appendOutput('Starting '+filename+' in the browser Luau sandbox. Roblox and executor APIs are partial mocks; mock files reset each run.','info');
 try{await verifyRuntime([...compileFiles,...mockFiles])}catch(e){if(sequence===runSequence){appendOutput(e.message,'error');window.UIViewer.setStatus(e.message);finishRun()}return}
 if(sequence!==runSequence)return;
 try{runWorker=new Worker('runtime/worker.js',{type:'module'});runPending=false}catch(e){appendOutput('Could not start the Luau worker: '+e.message+'. Serve the project over HTTP(S).','error');finishRun();return}
 armRunTimeout();
 const worker=runWorker;
 runWorker.onmessage=({data})=>{
  if(data.type==='http-permission-request'){promptNetwork(worker,data);return}
  if(data.type==='output'){appendOutput(data.text,data.level);return}
  if(data.type==='ui'){window.UIViewer.render(data.json);return}
  if(data.type==='done'){appendOutput('Execution finished.','info');previewWorker=runWorker;runWorker=null;finishRun();window.UIViewer.setStatus('Script finished · click supported buttons to test them.');return}
  if(data.type==='error'){
   appendOutput(data.message,'error');
   const match=data.message.match(/\[string ["'](.*?)["']\]:(\d+):/);
   if(match && match[1]===filename && active===fileId && editor.value===code){const line=Number(match[2]);runtimeDiagnostics=[{severity:'error',line,col:1,endCol:999,message:'Runtime / Luau compiler: '+data.message}];renderEditor()}
   window.UIViewer.setStatus('Script stopped with an error. Preview is a snapshot.');finishRun();
  }
 };
 runWorker.onerror=e=>{appendOutput('Runtime failed to load: '+(e.message||'worker error')+'. Run the site over HTTP(S), not file://.','error');finishRun()};
 // The official WindUI example first tries its Studio source module. This
 // exact recognizable example gets a simulated public module, without exposing
 // executor APIs to ordinary LocalScripts. Network consent is still required.
 const winduiStudioModule=type==='LocalScript' && /require\s*\(\s*['"]\.\/src\/Init['"]\s*\)/.test(code) && /https:\/\/raw\.githubusercontent\.com\/Footagesus\/WindUI\/[^'"\s]+\/dist\/main\.lua/i.test(code);
 if(winduiStudioModule)appendOutput('Recognized the official WindUI example: using the browser’s WindUI Studio module adapter and offset compatibility for this run. This does not enable executor APIs.','warn');
 runWorker.postMessage({type:'run',code,filename,scriptType:type,winduiCompat:settings.winduiCompat||winduiStudioModule,winduiStudioModule});
}
$('runBtn').onclick=runCode;
function editorSettings(){showModal('Editor settings','MAKE IT YOURS',`<div class="settings-list"><label class="setting-row"><span><strong>Auto-close brackets & quotes</strong><small>Insert matching (), [], {}, quotes and backticks.</small></span><input type="checkbox" id="settingPairs" ${settings.autoPairs?'checked':''}></label><label class="setting-row"><span><strong>Auto indent</strong><small>Indent new lines inside blocks and brackets.</small></span><input type="checkbox" id="settingIndent" ${settings.autoIndent?'checked':''}></label><label class="setting-row"><span><strong>Word wrap</strong><small>Wrap long lines to fit the editor.</small></span><input type="checkbox" id="settingWrap" ${settings.wordWrap?'checked':''}></label><label class="setting-row"><span><strong>Automatic suggestions</strong><small>Show completions as you type. Ctrl Space always works.</small></span><input type="checkbox" id="settingSuggest" ${settings.autoSuggest?'checked':''}></label><label class="setting-row"><span><strong>Line numbers</strong><small>Show line numbers beside your code.</small></span><input type="checkbox" id="settingLines" ${settings.lineNumbers?'checked':''}></label><label class="setting-row"><span><strong>WindUI compatibility</strong><small>Convert false UDim offsets to zero; strict runs normally reject them.</small></span><input type="checkbox" id="settingWindUI" ${settings.winduiCompat?'checked':''}></label><label class="setting-row"><span><strong>Run timeout</strong><small>Choose how long scripts run; use Stop for long-running interfaces.</small></span><select id="settingRunTimeout" aria-label="Run timeout"><option value="10">10 seconds</option><option value="30">30 seconds</option><option value="120">2 minutes</option><option value="300">5 minutes</option><option value="0">Until stopped</option></select></label><label class="setting-row"><span><strong>Indent size</strong><small>Spaces inserted by Tab and auto indent.</small></span><select id="settingTab" aria-label="Indent size"><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="8">8 spaces</option></select></label><label class="setting-row"><span><strong>Font size</strong><small>Change editor text size.</small></span><select id="settingFont" aria-label="Font size"><option value="12">12 px</option><option value="14">14 px</option><option value="16">16 px</option><option value="18">18 px</option></select></label></div><div class="settings-help">Undo <kbd>Ctrl Z</kbd> · Redo <kbd>Ctrl Shift Z</kbd> · Comment <kbd>Ctrl /</kbd></div><div class="modal-actions"><button class="top-button" id="resetSettings">Reset defaults</button><button class="primary-btn" id="doneSettings">Done</button></div>`);const map={settingPairs:'autoPairs',settingIndent:'autoIndent',settingWrap:'wordWrap',settingSuggest:'autoSuggest',settingLines:'lineNumbers',settingWindUI:'winduiCompat'};for(const [id,key] of Object.entries(map))$(id).onchange=()=>{settings[key]=$(id).checked;applySettings()};$('settingTab').value=String(settings.tabSize);$('settingTab').onchange=()=>{settings.tabSize=Number($('settingTab').value);applySettings()};$('settingRunTimeout').value=String(settings.runTimeout);$('settingRunTimeout').onchange=()=>{settings.runTimeout=Number($('settingRunTimeout').value);applySettings()};$('settingFont').value=String(settings.fontSize);$('settingFont').onchange=()=>{settings.fontSize=Number($('settingFont').value);applySettings()};$('resetSettings').onclick=()=>{settings={...defaultSettings};applySettings();editorSettings()};$('doneSettings').onclick=hideModal}
for(const id of ['undoBtn','redoBtn'])$(id).addEventListener('mousedown',e=>e.preventDefault());$('undoBtn').onclick=()=>historyMove(-1);$('redoBtn').onclick=()=>historyMove(1);$('settingsBtn').onclick=editorSettings;
$('checkBtn').onclick=check;$('formatBtn').onclick=format;$('formatTextBtn').onclick=format;$('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText(editor.value);toast('Copied to clipboard')}catch(e){editor.focus();editor.select();toast('Select and copy the script')}};$('downloadBtn').onclick=()=>{const blob=new Blob([editor.value],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=current().name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Script exported')};
$('newFileBtn').onclick=newMenu;$('projectPicker').onclick=projectPicker;$('addFileBtn').onclick=newFile;$('newFileBottom').onclick=newFile;$('templatesBtn').onclick=templates;$('activityTemplates').onclick=templates;$('activityHelp').onclick=help;$('activitySearch').onclick=find;$('activityFiles').onclick=()=>{$('sidebar').classList.toggle('open')};$('toggleSidebar').onclick=()=>$('sidebar').classList.toggle('open');$('toggleInfo').onclick=()=>{if(window.innerWidth<=850)$('inspector').classList.toggle('open');else $('inspector').classList.toggle('closed')};$('closeInfo').onclick=()=>{if(window.innerWidth<=850)$('inspector').classList.remove('open');else $('inspector').classList.add('closed')};$('closeModal').onclick=hideModal;$('modal').onclick=e=>{if(e.target===$('modal'))hideModal()};$('modalContent').addEventListener('click',e=>{const projectBtn=e.target.closest('[data-project]');if(projectBtn){switchProject(projectBtn.dataset.project);return}const btn=e.target.closest('[data-template]');if(!btn)return;const t=API.TEMPLATES.find(x=>x.id===btn.dataset.template);if(!t)return;const id='f'+Date.now()+Math.random().toString(36).slice(2,6),name=t.id+(t.scriptType==='LocalScript'?'.client.luau':t.scriptType==='Script'?'.server.luau':t.scriptType==='ExploitScript'?'.exploit.luau':'.luau');files.push({id,name,type:t.scriptType,code:t.code});hideModal();switchFile(id);toast('Template added as a new script')});$('findNext').onclick=findNext;$('closeFind').onclick=()=>{$('findBox').hidden=true;editor.focus()};$('findInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();findNext()}if(e.key==='Escape')$('closeFind').click()};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();toast(storageAvailable?'Saved to this browser':'Could not save locally')}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();find()}if(e.key==='Escape'&&!$('modal').hidden)hideModal()});
$('importBtn').onclick=()=>{showModal('Import scripts','YOUR WORKSPACE',`<label class="form-label" for="importType">Script type</label><select class="form-input" id="importType"><option value="auto">Auto-detect from file name</option><option value="Script">Script · server</option><option value="LocalScript">LocalScript · client / GUI</option><option value="ModuleScript">ModuleScript · shared module</option><option value="ExploitScript">Exploit script · executor client</option></select><p class="form-hint">Choose one or more .lua, .luau, or .txt files (maximum 2 MB each). .client.luau and .exploit.luau are detected automatically. For other GUI scripts, choose LocalScript or Exploit script above. Roblox place files (.rbxl) cannot be imported.</p><div class="modal-actions"><button class="top-button" id="cancelImport">Cancel</button><button class="primary-btn" id="chooseImportFiles">Choose files</button></div>`);$('cancelImport').onclick=hideModal;$('chooseImportFiles').onclick=()=>$('importInput').click()};
$('importInput').onchange=async e=>{const selected=Array.from(e.target.files||[]);e.target.value='';if(!selected.length)return;const importProject=projectId,chosenType=$('importType')?.value||'auto';if(!$('modal').hidden)hideModal();let last=null,failed=0;for(const file of selected){if(!/\.(lua|luau|txt)$/i.test(file.name)||file.size>2*1024*1024){failed++;continue}try{const code=await file.text();if(projectId!==importProject){toast('Import stopped because you switched projects');return}const name=uniqueName(file.name),type=chosenType!=='auto'?chosenType:/\.client\.(lua|luau)$/i.test(name)?'LocalScript':/\.exploit\.(lua|luau)$/i.test(name)?'ExploitScript':/\.module\.(lua|luau)$/i.test(name)?'ModuleScript':'Script',id='f'+Date.now()+Math.random().toString(36).slice(2,8);files.push({id,name,type,code});last=id}catch(err){failed++}}if(last)switchFile(last);if(failed)toast(failed+' file(s) skipped: use .lua, .luau or .txt under 2 MB');else toast(selected.length+' script(s) imported');};
window.UIViewer.init({run:runCode,click:id=>(runWorker||previewWorker)?.postMessage({type:'ui-click',id}),input:(id,text,stage,enter)=>(runWorker||previewWorker)?.postMessage({type:'ui-input',id,text,stage,enter}),pointer:(id,phase,x,y,pointerId,touch,rectangles)=>(runWorker||previewWorker)?.postMessage({type:'ui-pointer',id,phase,x,y,pointerId,touch,rectangles}),images:promptImages,proxy:promptThumbnailProxy,demo:()=>{const id='f'+Date.now()+Math.random().toString(36).slice(2,8);files.push({id,name:uniqueName('UI Example.client.luau'),type:'LocalScript',code:window.UIViewer.demo});switchFile(id);toast('Example added — press Run in the viewer')}});
window.addEventListener('resize',renderEditor);editor.value=current().code;activateHistory();renderFiles();applySettings();scheduleCompile();save();
})();
