const http=require('node:http');
http.createServer(async(req,res)=>{
 try {
  const upstream=await fetch('http://127.0.0.1:43187/privacy');
  const csp=upstream.headers.get('content-security-policy');
  const nonce=/'nonce-([^']+)'/.exec(csp)[1];
  const policy=req.url==='/control' ? '' : csp;
  res.writeHead(200,{'content-type':'text/html',...(policy?{'content-security-policy':policy}:{})});
  res.end(`<!doctype html><title>CSP parser probe</title><p id="status">pending</p><script>window.parserCanary=927</script><script nonce="${nonce}">document.getElementById('status').textContent=window.parserCanary===927?'UNTRUSTED_SCRIPT_EXECUTED':'UNTRUSTED_SCRIPT_BLOCKED';window.trustedCanary=true</script>`);
 }catch{res.writeHead(500);res.end('probe failed')}
}).listen(43188,'127.0.0.1');
