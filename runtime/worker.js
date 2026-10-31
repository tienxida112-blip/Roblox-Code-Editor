let state, acceptingClicks = false, resolveHttpPermission = null, uiQueue = Promise.resolve();
let scriptRunning = false, pendingUi = [], wakeWait = null, reportedQueueLimit = false;
self.onmessage = async ({data}) => {
  if (data.type === 'http-permission') { if (resolveHttpPermission) {const resolve=resolveHttpPermission;resolveHttpPermission=null;resolve(data.allowed===true)} return; }
  if (data.type === 'ui-click' || data.type === 'ui-input' || data.type === 'ui-pointer') {
    if (!state || !acceptingClicks || !Number.isSafeInteger(data.id)) return;
    if (data.type === 'ui-input' && (typeof data.text !== 'string' || data.text.length > 4096 || !['focus','input','blur'].includes(data.stage))) return;
    if (data.type === 'ui-pointer' && (!['down','move','up'].includes(data.phase) || !Number.isFinite(data.x) || !Number.isFinite(data.y) || !Number.isSafeInteger(data.pointerId) || Math.abs(data.x)>100000 || Math.abs(data.y)>100000)) return;
    if (data.type === 'ui-pointer' && (!Array.isArray(data.rectangles) || data.rectangles.length > 80 || data.rectangles.some(r=>!Array.isArray(r)||r.length!==5||!Number.isSafeInteger(r[0])||r.slice(1).some(v=>!Number.isFinite(v)||Math.abs(v)>100000)))) return;
    if (scriptRunning) {
      if (pendingUi.length >= 100) {
        if (!reportedQueueLimit) {reportedQueueLimit=true;self.postMessage({type:'output',level:'warn',text:'UI event queue is full; some interactions were dropped.'})}
        return;
      }
      pendingUi.push(data);
      if (wakeWait) wakeWait();
      return;
    }
    // Serialize UI events so rapid typing/clicks are not discarded while a
    // previous callback is executing in the same Luau state.
    uiQueue=uiQueue.then(async()=>{
      if (!state || !acceptingClicks) return;
      let source=`__uiClick(${data.id})`;
      if (data.type === 'ui-input') {
        const bytes=new TextEncoder().encode(data.text);
        const literal='"'+Array.from(bytes,b=>'\\'+String(b).padStart(3,'0')).join('')+'"';
        source=`__uiInput(${data.id},${literal},"${data.stage}",${data.enter===true})`;
      } else if(data.type==='ui-pointer') {
        const rects='{'+data.rectangles.map(row=>'{'+row.join(',')+'}').join(',')+'}';
        source=`__uiPointer(${data.id},"${data.phase}",${data.x},${data.y},${data.pointerId},${data.touch===true},${rects})`;
      }
      await state.loadstring(source, 'ui-event', true)();
    }).catch(error=>self.postMessage({type:'output',level:'error',text:'UI event: '+String(error && error.message || error)}));
    await uiQueue;
    return;
  }
  if (data.type !== 'run' && data.type !== 'check') return;
  let keepState = false, bootstrapLoaded = false;
  try {
    const { LuauState } = await import('../vendor/luau-web/src/index.js');
    if (data.type === 'check') {
      state = await LuauState.createAsync();
      try {
        state.loadstring(data.code, data.filename || 'script.luau', true);
        self.postMessage({type:'compile-ok'});
      } catch (error) {
        self.postMessage({type:'compile-error', message: String(error && error.message || error)});
      }
      return;
    }
    const { bootstrap } = await import('./mock.js');
    const { createHttpBridge } = await import('./http.js');
    const httpBridge = createHttpBridge(info => new Promise(resolve => {resolveHttpPermission=resolve;self.postMessage({type:'http-permission-request',origin:info.origin,method:info.method})}), globalThis.fetch, text => self.postMessage({type:'output',level:'warn',text}));
    let count = 0, nextHttpId = 0;
    const httpResults = new Map();
    state = await LuauState.createAsync({
      __scriptType: data.scriptType,
      __winduiCompat: data.winduiCompat === true,
      __winduiStudioModule: data.winduiStudioModule === true,
      // luau-web marshals returned JS strings through the Wasm stack. Transfer
      // bounded chunks to avoid a stack overflow on large HTTP responses.
      __httpStart: async encoded => {
        const result = await httpBridge(encoded), id=++nextHttpId;
        httpResults.set(id, {result,index:0});
        return id;
      },
      __httpNext: id => {
        const record=httpResults.get(id);
        if (!record) return '';
        let end=Math.min(record.index+16384,record.result.length);
        if(end<record.result.length && /[\uD800-\uDBFF]/.test(record.result[end-1])) end--;
        const part=record.result.slice(record.index,end);
        record.index=end;
        if(end>=record.result.length) httpResults.delete(id);
        return part;
      },
      __wait: async (seconds) => {
        const start = performance.now();
        await new Promise(resolve => {
          let timer;
          const wake=()=>{clearTimeout(timer);if(wakeWait===wake)wakeWait=null;resolve()};
          wakeWait=wake;
          timer=setTimeout(wake,Math.min(10000,Math.max(0,Number(seconds))*1000));
          if(pendingUi.length)queueMicrotask(wake);
        });
        return (performance.now() - start) / 1000;
      },
      __nextUiEvent: () => pendingUi.length ? JSON.stringify(pendingUi.shift()) : '',
      __uiPost: (json) => { if (String(json).length < 1000000) self.postMessage({type:'ui',json:String(json)}); },
      __compile: (source, chunkName) => {
        if (typeof source !== 'string') return [null, 'loadstring expects a string'];
        try { return state.loadstring(source, String(chunkName || 'loadstring'), true); }
        catch (error) { return [null, String(error && error.message || error)]; }
      },
      __output: (level, text) => {
        if (count++ < 300) self.postMessage({type:'output',level,text:String(text).slice(0,4000)});
        else if (count === 301) self.postMessage({type:'output',level:'warn',text:'Output limit reached; further messages suppressed.'});
      }
    });
    await state.loadstring(bootstrap, 'browser-mock', true)();
    bootstrapLoaded = true;
    const fn = state.loadstring(data.code, data.filename || 'script.luau', true);
    acceptingClicks = true; scriptRunning = true; pendingUi=[]; reportedQueueLimit=false;
    const result = await fn();
    scriptRunning = false;
    if (pendingUi.length) await state.loadstring('__drainUI()', 'ui-pending', true)();
    if (result && result.length) self.postMessage({type:'output',level:'return',text:'Returned: '+result.map(String).join(', ')});
    await state.loadstring('__drainDeferred(); __publishUI()', 'ui-snapshot', true)();
    acceptingClicks = true;
    keepState = true;
    self.postMessage({type:'done'});
  } catch (error) {
    if (bootstrapLoaded) { try { await state.loadstring('__publishUI()', 'ui-snapshot', true)(); } catch (_) {} }
    self.postMessage({type:'error', message: String(error && error.message || error)});
  } finally { scriptRunning=false; wakeWait=null; pendingUi=[]; if (state && !keepState) {acceptingClicks=false;state.destroy();state=null;} }
};
