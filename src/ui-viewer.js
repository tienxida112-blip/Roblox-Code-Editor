(() => {
'use strict';
const $=id=>document.getElementById(id);
let actions, nodes=[], running=false, allowImages=false, imageOrigins=new Set(), imageCache=new Map(), imageBlobs=new Set(), imageControllers=new Set(), imageGeneration=0, assetIds=new Set(), filterSequence=0, hasRobloxAssets=false, proxyAllowed=false, failedAssets=new Set(), thumbnailCache=new Map(), thumbnailPending=new Map(), thumbnailTimer=null, thumbnailBusy=false;
const demo=`-- A small interactive UI for the browser viewer
local Players = game:GetService("Players")
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "DemoUI"
gui.Parent = playerGui

local frame = Instance.new("Frame")
frame.Size = UDim2.fromOffset(300, 180)
frame.Position = UDim2.fromScale(0.5, 0.5)
frame.AnchorPoint = Vector2.new(0.5, 0.5)
frame.BackgroundColor3 = Color3.fromRGB(36, 33, 57)
frame.BorderSizePixel = 0
frame.Parent = gui
Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 14)

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -32, 0, 48)
title.Position = UDim2.fromOffset(16, 16)
title.BackgroundTransparency = 1
title.Text = "Hello, creator!"
title.TextColor3 = Color3.fromRGB(255, 255, 255)
title.TextSize = 22
title.Parent = frame

local button = Instance.new("TextButton")
button.Size = UDim2.new(1, -48, 0, 48)
button.Position = UDim2.new(0, 24, 1, -68)
button.BackgroundColor3 = Color3.fromRGB(170, 145, 255)
button.BorderSizePixel = 0
button.TextColor3 = Color3.fromRGB(25, 20, 45)
button.Text = "Click me"
button.TextSize = 16
button.Parent = frame
Instance.new("UICorner", button).CornerRadius = UDim.new(0, 8)

local clicks = 0
button.MouseButton1Click:Connect(function()
    clicks += 1
    title.Text = "Clicked " .. clicks .. " times!"
    print("Button clicked", clicks)
end)
`;
const num=(n,d=0)=>typeof n==='number'&&Number.isFinite(n)?Math.max(-100000,Math.min(100000,n)):d;
const pct=n=>`${num(n)*100}%`;
const dim=(scale,offset)=>num(scale)===0?`${num(offset)}px`:num(offset)===0?pct(scale):`calc(${pct(scale)} + ${num(offset)}px)`;
const rgba=(rgb,transparency=0)=>{const a=Array.isArray(rgb)?rgb:[1,1,1];return `rgba(${a.map(x=>Math.round(Math.max(0,Math.min(1,num(x)))*255)).join(',')},${1-Math.max(0,Math.min(1,num(transparency)))})`};
// Public image assets are loaded by the browser as images (not fetched as
// readable bytes); Roblox's redirect does not provide CORS headers.
function robloxAssetId(value){
 if(typeof value!=='string')return null;
 let m=value.trim().match(/^(?:rbxassetid:\/\/)?(\d{1,20})$/i);if(m)return m[1];
 m=value.trim().match(/^rbxthumb:\/\/type=asset&id=(\d{1,20})(?:&.*)?$/i);if(m)return m[1];
 try{const u=new URL(value);if((u.hostname==='www.roblox.com'||u.hostname==='roblox.com'||u.hostname==='assetdelivery.roblox.com')&&(/\/asset\/?$/i.test(u.pathname))){const id=u.searchParams.get('id');if(/^\d{1,20}$/.test(id||''))return id}}catch(_){}return null;
}
function loadRobloxAsset(img,id){
 if(!assetIds.has(id)&&assetIds.size>=500){img.title='Asset preview limit reached (500 per run)';img.dispatchEvent(new Event('error'));return}
 assetIds.add(id);img.referrerPolicy='no-referrer';img.decoding='async';
 img.title='Roblox asset '+id;
 img.src='https://assetdelivery.roblox.com/v1/asset/?id='+encodeURIComponent(id);
}
// An explicit per-run opt-in is required before contacting this third party.
// Batch IDs rather than making one request per icon; never forward cookies.
function thumbnailFor(id){
 if(thumbnailCache.has(id))return thumbnailCache.get(id);
 const promise=new Promise(resolve=>thumbnailPending.set(id,resolve));thumbnailCache.set(id,promise);
 if(!thumbnailTimer&&!thumbnailBusy)thumbnailTimer=setTimeout(flushThumbnails,80);
 return promise;
}
async function flushThumbnails(){
 thumbnailTimer=null;if(thumbnailBusy||!thumbnailPending.size)return;thumbnailBusy=true;
 const batch=[...thumbnailPending.entries()].slice(0,40);for(const [id] of batch)thumbnailPending.delete(id);
 const generation=imageGeneration,controller=new AbortController();imageControllers.add(controller);const timer=setTimeout(()=>controller.abort(),15000);let found=new Map();
 try{
  const url='https://thumbnails.roproxy.com/v1/assets?assetIds='+batch.map(([id])=>encodeURIComponent(id)).join(',')+'&returnPolicy=PlaceHolder&size=420x420&format=Png&isCircular=false';
  const r=await fetch(url,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});if(!r.ok)throw Error('thumbnail request failed');
  const reader=r.body?.getReader(),decoder=new TextDecoder(),parts=[];let size=0;
  if(reader){for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>262144){await reader.cancel();throw Error('thumbnail response too large')}parts.push(decoder.decode(item.value,{stream:true}))}parts.push(decoder.decode())}
  // Preserve numeric asset IDs beyond JavaScript's safe integer range.
  const raw=parts.join('').replace(/("targetId"\s*:\s*)(\d+)(?=\s*[,}])/g,'$1"$2"'),data=JSON.parse(raw);
  for(const item of Array.isArray(data.data)?data.data:[]){
   if(item.state!=='Completed'||typeof item.imageUrl!=='string')continue;
   try{const u=new URL(item.imageUrl);if(u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='rbxcdn.com'||u.hostname.endsWith('.rbxcdn.com')))found.set(String(item.targetId),u.href)}catch(_){}
  }
 }catch(_){}finally{clearTimeout(timer);imageControllers.delete(controller);for(const [id,resolve] of batch)resolve(generation===imageGeneration?(found.get(id)||null):null);thumbnailBusy=false;if(thumbnailPending.size)thumbnailTimer=setTimeout(flushThumbnails,80)}
}
function failImage(img,wrapper,el,assetId){img.dataset.failed='true';wrapper.dataset.loading='false';wrapper.dataset.failed='true';el.title=assetId?'Roblox asset '+assetId+' unavailable, private, or not an image':'Image unavailable or blocked by CORS';img.style.visibility='hidden'}
function loadThumbnail(img,wrapper,el,id){
 const generation=imageGeneration;img.dataset.thumbnail='true';wrapper.dataset.loading='true';img.style.visibility='hidden';
 thumbnailFor(id).then(src=>{if(generation!==imageGeneration||!img.isConnected)return;if(!src){failImage(img,wrapper,el,id);return}img.style.width='100%';img.style.height='100%';img.style.left='0';img.style.top='0';img.style.objectFit='contain';img.style.visibility='visible';img.referrerPolicy='no-referrer';img.title='Approximate public thumbnail for Roblox asset '+id;img.src=src});
}
function loadImage(img,url){
 const generation=imageGeneration;
 if(!imageCache.has(url)){
  if(imageCache.size>=30)return;
  imageCache.set(url,(async()=>{const controller=new AbortController();imageControllers.add(controller);const timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(url,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});if(!response.ok)return null;const len=Number(response.headers.get('content-length'));if(Number.isFinite(len)&&len>1048576){await response.body?.cancel();return null}const reader=response.body?.getReader(),chunks=[];let size=0;if(reader){for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>1048576){await reader.cancel();return null}chunks.push(item.value)}}const blob=new Blob(chunks,{type:response.headers.get('content-type')||'application/octet-stream'});const src=URL.createObjectURL(blob);if(generation!==imageGeneration){URL.revokeObjectURL(src);return null}imageBlobs.add(src);return src}catch(_){return null}finally{clearTimeout(timer);imageControllers.delete(controller)}})());
 }
 imageCache.get(url).then(src=>{if(generation!==imageGeneration||!img.isConnected)return;if(src)img.src=src;else img.dispatchEvent(new Event('error'))});
}
function gradientCSS(gradient){
 if(!gradient||!Array.isArray(gradient.colors)||gradient.colors.length<2)return '';
 const transparency=Array.isArray(gradient.transparency)?gradient.transparency:[];
 const alphaAt=t=>{if(!transparency.length)return 0;let a=transparency[0];for(let i=1;i<transparency.length;i++){const b=transparency[i];if(t<=b.time){const d=b.time-a.time;return num(a.value)+(num(b.value)-num(a.value))*(d?(t-a.time)/d:0)}a=b}return num(a.value)};
 return `linear-gradient(${90+num(gradient.rotation)}deg, ${gradient.colors.map(stop=>`${rgba(stop.color,alphaAt(num(stop.time)))} ${Math.max(0,Math.min(100,num(stop.time)*100))}%`).join(', ')})`;
}
function draw(node,inList=false){
 if(!node || node.visible===false || node.enabled===false)return null;
 const isScreen=node.class==='ScreenGui',isButton=['TextButton','ImageButton'].includes(node.class),isTextBox=node.class==='TextBox',el=document.createElement(isButton?'button':'div');
 el.className='mock-ui-node';el.dataset.class=node.class;el.dataset.scaleType=node.scaleType||'';el.dataset.name=node.name||'';el.dataset.uiId=String(node.id);
 if(isScreen){el.style.position='absolute';el.style.inset='0';el.style.pointerEvents='none'}else{
  const s=node.size||[0,100,0,100],p=node.position||[0,0,0,0],a=node.anchor||[0,0];
  const autoX=(node.automaticSize==='X'||node.automaticSize==='XY')&&num(s[0])===0,autoY=(node.automaticSize==='Y'||node.automaticSize==='XY')&&num(s[2])===0;el.dataset.autoY=autoY?'true':'false';el.dataset.scaleY=String(num(s[2]));
  Object.assign(el.style,{position:inList?'relative':'absolute',width:dim(s[0],s[1]),height:dim(s[2],s[3]),background:rgba(node.background,node.transparency),border:`${Math.max(0,num(node.border))}px solid ${rgba(node.borderColor)}`,boxSizing:'border-box',zIndex:String(Math.max(0,num(node.z,1))),overflow:node.clip?'hidden':'visible',pointerEvents:(isButton||isTextBox||node.pointerEvents)?'auto':'none'});
  if(inList)el.style.flexShrink='0';
  if(num(node.aspectRatio)>0){el.style.aspectRatio=String(num(node.aspectRatio));if(node.aspectAxis==='Height')el.style.width='auto';else el.style.height='auto'}
  if(node.class==='ScrollingFrame'){el.style.overflowY='auto';el.style.overflowX='hidden';el.style.pointerEvents='auto';el.style.scrollbarWidth='thin'}
  // Roblox AutomaticSize is content-driven. CSS cannot measure its absolute
  // children directly, so provide a small readable/clickable approximation.
  if(node.automaticSize==='Y'||node.automaticSize==='XY') {
    if(autoY) {el.style.height='auto';el.style.minHeight=`${Math.max(0,num(s[3]),num(node.textSize,14)*1.5)}px`;}
  }
  if(node.automaticSize==='X'||node.automaticSize==='XY') {
    if(autoX) {el.style.width='auto';el.style.minWidth=`${Math.max(0,num(s[1]),20)}px`;}
  }
  if(!inList){el.style.left=dim(p[0],p[1]);el.style.top=dim(p[2],p[3]);el.style.transform=`translate(${-num(a[0])*100}%, ${-num(a[1])*100}%) rotate(${num(node.rotation)}deg)`}
  // Roblox asset delivery generally blocks cross-origin browser access. For
  // large tinted image panels, show a color-only placeholder rather than a
  // completely invisible surface. This is not the original Roblox image.
  if(node.imageColor && robloxAssetId(node.image) && (num(s[0])>=0.5||num(s[1])>=100) && (num(s[2])>=0.5||num(s[3])>=100) && num(node.transparency)===1){
    el.style.background=rgba(node.imageColor,node.imageTransparency);el.style.borderRadius='8px';
  }
  const grad=gradientCSS(node.gradient);if(grad&&!node.text)el.style.backgroundImage=grad;
  if(node.corner){el.style.borderRadius=dim(node.corner[0],node.corner[1])}
  if(node.stroke){el.style.outline=`${Math.max(0,num(node.stroke.thickness,1))}px solid ${rgba(node.stroke.color,node.stroke.transparency)}`}
  if(node.padding){el.style.padding=node.padding.map(d=>dim(d[0],d[1])).join(' ')}
  if(isButton){el.type='button';el.setAttribute('aria-label',node.text||node.name||'GUI button');el.onclick=e=>{e.stopPropagation();actions.click(node.id)}}
  if(node.pointerEvents){
   const sendPointer=(e,phase)=>{const r=$('viewerScreen').getBoundingClientRect(),scale=r.width/800;if(!scale)return;const rectangles=[el,...el.querySelectorAll('[data-ui-id]')].slice(0,80).map(item=>{const b=item.getBoundingClientRect();return [Number(item.dataset.uiId),(b.left-r.left)/scale,(b.top-r.top)/scale,b.width/scale,b.height/scale]});actions.pointer(node.id,phase,(e.clientX-r.left)/scale,(e.clientY-r.top)/scale,e.pointerId,e.pointerType==='touch',rectangles)};
   el.onpointerdown=e=>{e.stopPropagation();try{el.setPointerCapture(e.pointerId)}catch(_){}sendPointer(e,'down')};
   el.onpointermove=e=>{if(el.hasPointerCapture(e.pointerId))sendPointer(e,'move')};
   el.onpointerup=e=>{if(el.hasPointerCapture(e.pointerId))sendPointer(e,'up')};
   el.onpointercancel=e=>{if(el.hasPointerCapture(e.pointerId))sendPointer(e,'up')};
  }
  if(node.text!==undefined){
   const text=document.createElement(isTextBox?(node.multiLine?'textarea':'input'):'div');text.className='mock-ui-text';
   if(isTextBox){
    text.value=String(node.text);text.placeholder=node.placeholder||'';text.maxLength=4096;
    let entered=false;
    text.onfocus=()=>{if(node.clearOnFocus)text.value='';actions.input(node.id,text.value,'focus',false)};
    text.oninput=()=>{actions.input(node.id,text.value,'input',false)};
    text.onkeydown=e=>{if(e.key==='Enter'&&!node.multiLine){e.preventDefault();entered=true;text.blur()}};
    text.onblur=()=>{actions.input(node.id,text.value,'blur',entered);entered=false};
    Object.assign(text.style,{pointerEvents:'auto',width:'100%',height:'100%',background:'transparent',border:'0',outline:'none',padding:'0',resize:'none'});
   } else text.textContent=String(node.text);
   // Text is normally positioned over its GUI object. For content-sized text,
   // let it participate in intrinsic measurement rather than staying 20px wide.
   if((autoX||autoY)&&!isTextBox){text.style.position='relative';text.style.inset='auto';if(autoX){el.style.width='max-content';text.style.width='max-content'}else text.style.width='100%';if(autoY)text.style.height='auto';}
   if(grad&&!isTextBox){text.style.backgroundImage=grad;text.style.backgroundClip='text';text.style.webkitBackgroundClip='text';text.style.color='transparent'}
   Object.assign(text.style,{color:rgba(node.textColor,node.textTransparency),fontSize:`${Math.max(1,num(node.textSize,14))}px`,whiteSpace:node.textWrapped?'pre-wrap':'pre',textAlign:({Left:'left',Right:'right'})[node.textX]||'center',alignItems:({Top:'flex-start',Bottom:'flex-end'})[node.textY]||'center',justifyContent:({Left:'flex-start',Right:'flex-end'})[node.textX]||'center',fontFamily:'Arial, sans-serif'});if(grad&&!isTextBox)text.style.color='transparent';el.append(text)
  }
  const assetId=robloxAssetId(node.image);const directImage=!assetId && /^https?:\/\//i.test(node.image||'');
  if(assetId||directImage){
   if(assetId){hasRobloxAssets=true;imageOrigins.add('https://assetdelivery.roblox.com')} else try{imageOrigins.add(new URL(node.image).origin)}catch(_){}
   if(allowImages){
    const img=document.createElement('img');img.className='mock-ui-image';img.alt='';img.style.opacity=String(1-Math.max(0,Math.min(1,num(node.imageTransparency))));
    img.style.objectFit=({Fit:'contain',Crop:'cover'})[node.scaleType]||'fill';
    const wrapper=document.createElement('div');wrapper.className='mock-ui-image-clip';wrapper.append(img);el.append(wrapper);
    img.onerror=()=>{if(assetId&&!img.dataset.thumbnail){failedAssets.add(assetId);if(proxyAllowed){loadThumbnail(img,wrapper,el,assetId);return}}failImage(img,wrapper,el,assetId)};
    img.addEventListener('load',()=>{wrapper.dataset.loading='false';wrapper.dataset.failed='false'});
    // A square thumbnail is not the original nine-slice bitmap. For large
    // tinted panels, retain the color placeholder instead of stretching the
    // thumbnail into a misleading giant shape.
    const largePanel=(num(s[0])>=0.5||num(s[1])>=100)&&(num(s[2])>=0.5||num(s[3])>=100);
    if(node.scaleType==='Slice'&&node.imageColor&&num(node.transparency)===1&&largePanel)img.addEventListener('load',()=>{
     if(!img.dataset.thumbnail)return;img.style.visibility='hidden';
     const radius=Math.min(40,Math.max(0,num(node.sliceCenter?.[0])*num(node.sliceScale,1)));if(radius)el.style.borderRadius=radius+'px';
    });
    const rect=node.imageRectSize||[0,0],offset=node.imageRectOffset||[0,0];
    if(num(rect[0])>0&&num(rect[1])>0)img.addEventListener('load',()=>{if(img.dataset.thumbnail)return;img.style.width=(img.naturalWidth/num(rect[0])*100)+'%';img.style.height=(img.naturalHeight/num(rect[1])*100)+'%';img.style.left=(-num(offset[0])/num(rect[0])*100)+'%';img.style.top=(-num(offset[1])/num(rect[1])*100)+'%';img.style.objectFit='fill'});
    if(node.imageColor && node.imageColor.some(c=>num(c,1)<0.999)){
     const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),defs=document.createElementNS(ns,'defs'),filter=document.createElementNS(ns,'filter'),matrix=document.createElementNS(ns,'feColorMatrix'),id='ui-image-tint-'+(++filterSequence);
     svg.setAttribute('width','0');svg.setAttribute('height','0');svg.setAttribute('aria-hidden','true');filter.id=id;filter.setAttribute('color-interpolation-filters','sRGB');matrix.setAttribute('type','matrix');const c=node.imageColor.map(v=>Math.max(0,Math.min(1,num(v))));matrix.setAttribute('values',`${c[0]} 0 0 0 0  0 ${c[1]} 0 0 0  0 0 ${c[2]} 0 0  0 0 0 1 0`);filter.append(matrix);defs.append(filter);svg.append(defs);wrapper.append(svg);wrapper.style.filter=`url(#${id})`;
    }
    if(assetId){if(failedAssets.has(assetId)){if(proxyAllowed)loadThumbnail(img,wrapper,el,assetId);else failImage(img,wrapper,el,assetId)}else loadRobloxAsset(img,assetId)}else loadImage(img,node.image);
   }
  }
 }
 if(node.list){const horizontal=node.list.direction==='Horizontal',h=({Center:'center',Right:'flex-end'})[node.list.horizontal]||'flex-start',v=({Center:'center',Bottom:'flex-end'})[node.list.vertical]||'flex-start';el.style.display='flex';el.style.flexDirection=horizontal?'row':'column';el.style.gap=dim(node.list.padding?.[0],node.list.padding?.[1]);el.style.alignItems=horizontal?v:h;el.style.justifyContent=horizontal?h:v} 
 const children=[...(node.children||[])];if(node.list)children.sort(node.list.sort==='LayoutOrder'?(a,b)=>num(a.order)-num(b.order):(a,b)=>String(a.name).localeCompare(String(b.name)));
 for(const child of children){const childEl=draw(child,!!node.list);if(childEl)el.append(childEl)}
 return el;
}
function scaleCanvas(){const screen=$('viewerScreen'),canvas=$('viewerCanvas');const width=screen.clientWidth;if(!width)return;canvas.style.inset='auto';canvas.style.left='0';canvas.style.top='0';canvas.style.width='800px';canvas.style.height='450px';canvas.style.transformOrigin='top left';canvas.style.transform=`scale(${width/800})`}
// Only objects that explicitly request automatic Y sizing are expanded.
// Measure fixed-size descendants (not 100%-height decoration layers) so an
// absolute content container can give its list item a useful height.
function measureAutomaticHeights(canvas){
 const scale=$('viewerScreen').clientWidth/800;if(!scale)return;
 const items=Array.from(canvas.querySelectorAll('[data-auto-y=true]')).reverse();
 for(let pass=0;pass<2;pass++)for(const el of items){
  const parent=el.getBoundingClientRect();let top=parent.top,bottom=parent.bottom;
  for(const child of el.querySelectorAll('[data-ui-id]')){
   if(num(Number(child.dataset.scaleY))!==0)continue;
   const r=child.getBoundingClientRect();if(!r.height||r.height>500*scale)continue;
   top=Math.min(top,r.top);bottom=Math.max(bottom,r.bottom);
  }
  const desired=(bottom-top)/scale;if(desired>el.getBoundingClientRect().height/scale+0.5&&desired<1000)el.style.minHeight=desired+'px';
 }
}
function render(json){scaleCanvas();try{nodes=JSON.parse(json);if(!Array.isArray(nodes))nodes=[]}catch(e){nodes=[]}const canvas=$('viewerCanvas');const scrollPositions=new Map(Array.from(canvas.querySelectorAll('[data-class=ScrollingFrame]'),el=>[el.dataset.uiId,[el.scrollLeft,el.scrollTop]]));canvas.replaceChildren();imageOrigins=new Set();hasRobloxAssets=false;for(const root of nodes){const el=draw(root);if(el)canvas.append(el)}measureAutomaticHeights(canvas);for(const el of canvas.querySelectorAll('[data-class=ScrollingFrame]')){const previous=scrollPositions.get(el.dataset.uiId);if(previous){el.scrollLeft=previous[0];el.scrollTop=previous[1]}}$('viewerImages').hidden=allowImages||!imageOrigins.size;$('viewerProxy').hidden=!allowImages||!hasRobloxAssets||proxyAllowed;$('viewerEmpty').hidden=nodes.some(n=>n.enabled!==false);}
function reset(status='Run a LocalScript or executor script to see its UI.'){nodes=[];allowImages=false;imageOrigins=new Set();imageGeneration++;proxyAllowed=false;hasRobloxAssets=false;failedAssets=new Set();thumbnailCache=new Map();clearTimeout(thumbnailTimer);thumbnailTimer=null;for(const resolve of thumbnailPending.values())resolve(null);thumbnailPending=new Map();for(const controller of imageControllers)controller.abort();imageControllers=new Set();for(const src of imageBlobs)URL.revokeObjectURL(src);imageBlobs=new Set();imageCache=new Map();assetIds=new Set();$('viewerImages').hidden=true;$('viewerProxy').hidden=true;$('viewerCanvas').replaceChildren();$('viewerEmpty').hidden=false;setStatus(status)}
function setStatus(text){$('viewerStatus').textContent=text}
function setRunning(value){running=value;$('viewerRun').textContent=running?'■  Stop script':'▶  Run current script'}
function init(callbacks){actions=callbacks;$('viewerBtn').onclick=()=>{$('viewer').hidden=false;scaleCanvas()};$('closeViewer').onclick=()=>{$('viewer').hidden=true};$('viewer').onclick=e=>{if(e.target===$('viewer'))$('viewer').hidden=true};$('viewerRun').onclick=()=>actions.run();$('viewerDemo').onclick=()=>actions.demo();$('viewerImages').onclick=()=>actions.images(Array.from(imageOrigins));$('viewerProxy').onclick=()=>actions.proxy();document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('viewer').hidden)$('viewer').hidden=true})}
window.addEventListener('resize',scaleCanvas);
function enableImages(){allowImages=true;render(JSON.stringify(nodes))}
function enableThumbnailProxy(){proxyAllowed=true;render(JSON.stringify(nodes))}
window.UIViewer={init,render,reset,setStatus,setRunning,enableImages,enableThumbnailProxy,demo};
})();
