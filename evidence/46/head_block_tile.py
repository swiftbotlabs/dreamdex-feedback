# headtile.py TARGET W : emulate width W, load overview, report the HEAD BLOCK tile text clipping
import json,sys,time,urllib.request,datetime,base64
import websocket
tid=sys.argv[1]; W=int(sys.argv[2]); out=sys.argv[3] if len(sys.argv)>3 else None
t=[x for x in json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json/list',timeout=5).read()) if x['id']==tid][0]
ws=websocket.create_connection(t['webSocketDebuggerUrl'],timeout=90,suppress_origin=True); n=[0]
def call(m,**p):
    n[0]+=1; i=n[0]; ws.send(json.dumps({'id':i,'method':m,'params':p}))
    while True:
        r=json.loads(ws.recv())
        if r.get('id')==i: return r.get('result',{})
def js(e): return call('Runtime.evaluate',expression=e,returnByValue=True,awaitPromise=True).get('result',{}).get('value')
mob = W<700
call('Emulation.setDeviceMetricsOverride',width=W,height=844 if mob else 900,deviceScaleFactor=2 if mob else 1,mobile=mob)
call('Page.navigate',url='https://new.explorer.somnia.network/'); time.sleep(12)
r=js("""(()=>{const lab=[...document.querySelectorAll('main *')].find(e=>e.childElementCount===0&&/^head block$/i.test(e.textContent.trim()));if(!lab)return 'no label';let tile=lab.parentElement;for(let k=0;k<4&&tile&&!/\\d{3},\\d{3}/.test(tile.textContent);k++)tile=tile.parentElement;const els=[...tile.querySelectorAll('*')].filter(e=>e.childElementCount===0&&/\\d{3},\\d{3},\\d{3}/.test(e.textContent));return els.map(e=>{const s=getComputedStyle(e);return {text:e.textContent.trim(),clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,clipped:e.scrollWidth>e.clientWidth,textOverflow:s.textOverflow,overflow:s.overflow,whiteSpace:s.whiteSpace,title:e.getAttribute('title')||e.parentElement.getAttribute('title'),fontSize:s.fontSize}})})()""")
print(datetime.datetime.now(datetime.timezone.utc).strftime('%FT%T')+'Z', 'viewport', W, json.dumps(r))
if out:
    d=call('Page.captureScreenshot',format='png')['data']; open(out,'wb').write(base64.b64decode(d)); print('saved',out)
call('Emulation.clearDeviceMetricsOverride')
