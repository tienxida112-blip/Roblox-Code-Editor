// Real HTTP through browser fetch, with an explicit per-run permission gate.
// Browser CORS and mixed-content policies are intentionally not bypassed.
const MAX_REQUEST_BYTES = 1024 * 1024;
const ALLOWED_METHODS = new Set(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']);
const FORBIDDEN_HEADERS = new Set(['accept-charset','accept-encoding','access-control-request-headers','access-control-request-method','connection','content-length','cookie','cookie2','date','dnt','expect','host','keep-alive','origin','referer','te','trailer','transfer-encoding','upgrade','user-agent','via']);
export function createHttpBridge(requestPermission, fetchImpl=globalThis.fetch, onWarning=()=>{}) {
  let permissionPromise=null;
  return async function httpBridge(encoded) {
    const fail = message => JSON.stringify({ok:false,error:message});
    try {
      const input=JSON.parse(encoded);
      if (!input || typeof input!=='object' || Array.isArray(input)) return fail('HTTP options must be a dictionary.');
      if (typeof input.Url!=='string' || input.Url.length>8192) return fail('HTTP Url must be a valid HTTP(S) URL.');
      let url;
      try {url=new URL(input.Url)} catch (_) {return fail('HTTP Url must be an absolute HTTP(S) URL.');}
      if (!['https:','http:'].includes(url.protocol) || url.username || url.password) return fail('HTTP supports only HTTP(S) URLs without embedded credentials.');
      const method=(input.Method||'GET').toUpperCase();
      if (!ALLOWED_METHODS.has(method)) return fail('Unsupported HTTP method: '+method+'.');
      if ((method==='GET'||method==='HEAD') && input.Body!==undefined) return fail(method+' requests cannot have a Body.');
      if (input.Body!==undefined && typeof input.Body!=='string') return fail('HTTP Body must be a string.');
      if (input.Body!==undefined && new TextEncoder().encode(input.Body).byteLength>MAX_REQUEST_BYTES) return fail('HTTP request body exceeds 1 MiB.');
      let provided=input.Headers||{};
      if (Array.isArray(provided) && provided.length===0) provided={};
      if (typeof provided!=='object'||provided===null||Array.isArray(provided)) return fail('HTTP Headers must be a string dictionary.');
      const headers=new Headers();
      for (const [name,value] of Object.entries(provided)) {
        const lower=name.toLowerCase();
        if(typeof value!=='string') return fail('HTTP header values must be strings.');
        // Chromium silently drops a script-specified User-Agent. Make that
        // behavior explicit rather than claiming the requested header was sent.
        if(lower==='user-agent') { onWarning('Browser ignored the requested User-Agent header; its own browser User-Agent will be used.'); continue; }
        if(FORBIDDEN_HEADERS.has(lower)||lower.startsWith('proxy-')||lower.startsWith('sec-')) return fail('Browser security does not permit the request header: '+name+'.');
        try{headers.append(name,value)}catch(_){return fail('Invalid HTTP header: '+name+'.');}
      }
      if (!permissionPromise) permissionPromise=Promise.resolve(requestPermission({origin:url.origin,method}));
      if (!await permissionPromise) return fail('Network permission denied for this run.');
      const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),60000);
      let response;
      try {
        response=await fetchImpl(url.href,{method,headers,body:input.Body,mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',cache:input.NoCache?'no-store':'default',redirect:'follow',signal:controller.signal});
        // No fixed response-size or request-count limit. The browser still has
        // finite memory and each request has a timeout. Decode incrementally to
        // avoid retaining a second complete copy of the response's bytes.
        const contentType=(response.headers.get('content-type')||'').toLowerCase();
        const binary=/^(?:image|audio|video)\//.test(contentType)||/^application\/(?:octet-stream|pdf|zip|gzip|wasm|x-protobuf)(?:;|$)/.test(contentType);
        const decoder=binary?null:new TextDecoder('utf-8',{ignoreBOM:true}),parts=[];
        let carry=new Uint8Array(0);
        if(response.body){
          const reader=response.body.getReader();
          for(;;){
            const {done,value}=await reader.read();if(done)break;
            if(!binary){parts.push(decoder.decode(value,{stream:true}));continue}
            // A multiple of three keeps each base64 chunk independently valid.
            const joined=new Uint8Array(carry.length+value.length);joined.set(carry);joined.set(value,carry.length);
            const length=joined.length-joined.length%3;
            for(let i=0;i<length;i+=12288)parts.push(btoa(String.fromCharCode(...joined.subarray(i,Math.min(i+12288,length)))));
            carry=joined.slice(length);
          }
        }
        if(binary){if(carry.length)parts.push(btoa(String.fromCharCode(...carry)))}else parts.push(decoder.decode());
        const outHeaders={};response.headers.forEach((value,name)=>{outHeaders[name]=value});
        const result={Success:response.ok,StatusCode:response.status,StatusMessage:response.statusText||'',Headers:outHeaders};
        if(binary)result.BodyBase64=parts.join('');else result.Body=parts.join('');
        return JSON.stringify({ok:true,result});
      } catch (error) {
        if(error?.name==='AbortError') return fail('HTTP request timed out after 60 seconds.');
        return fail('HTTP request failed or was blocked by the browser. Check the URL, network connection, CORS, and HTTPS/mixed-content restrictions.');
      } finally {clearTimeout(timer)}
    } catch (error) {return fail('HTTP request could not be prepared: '+String(error?.message||error));}
  };
}
