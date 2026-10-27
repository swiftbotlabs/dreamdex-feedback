# stat_tiles.py TARGET_ID W : emulate width W (mobile if < 700), load the overview, list every text element in the
# four stat tiles (HEAD BLOCK, BLOCK TIME, TRANSACTIONS, EVENTS) whose text is wider than its box
import json,sys,time,urllib.request,datetime
import websocket
tid=sys.argv[1]; W=int(sys.argv[2])
t=[x for x in json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json/list',timeout=5).read()) if x['id']==tid][0]
ws=websocket.create_connection(t['webSocketDebuggerUrl'],timeout=90,suppress_origin=True); n=[0]
def call(m,**p):
    n[0]+=1; i=n[0]; ws.send(json.dumps({'id':i,'method':m,'params':p}))
    while True:
        r=json.loads(ws.recv())
        if r.get('id')==i: return r.get('result',{})
def js(e): return call('Runtime.evaluate',expression=e,returnByValue=True,awaitPromise=True).get('result',{}).get('value')
mob=W<700
call('Emulation.setDeviceMetricsOverride',width=W,height=844 if mob else 900,deviceScaleFactor=2 if mob else 1,mobile=mob)
call('Page.navigate',url='https://new.explorer.somnia.network/'); time.sleep(12)
r=js("""(()=>{const lab=[...document.querySelectorAll('main *')].find(e=>e.childElementCount===0&&/^head block$/i.test(e.textContent.trim()));
let grid=lab;for(let k=0;k<6&&grid&&!/events/i.test(grid.textContent);k++)grid=grid.parentElement;
const out=[];for(const e of grid.querySelectorAll('*')){if(e.childElementCount===0&&e.textContent.trim()){out.push({text:e.textContent.trim().slice(0,40),cls:e.className.toString().slice(0,60),w:e.clientWidth,sw:e.scrollWidth,cut:e.scrollWidth>e.clientWidth,title:e.getAttribute('title')})}}
return {gridColumns:getComputedStyle(grid).gridTemplateColumns,items:out}})()""")
print(datetime.datetime.now(datetime.timezone.utc).strftime('%FT%T')+'Z', 'viewport', W, 'grid', r['gridColumns'])
for it in r['items']: print('   ', 'CUT ' if it['cut'] else 'ok  ', f"{it['w']:>4}/{it['sw']:<4}", repr(it['text']), it['cls'], 'title=',it['title'])
call('Emulation.clearDeviceMetricsOverride')
