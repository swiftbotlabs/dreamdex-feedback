# Read-only page capture in a FRESH isolated browser context (no cookies, no wallet = logged out).
# Opens its own target, records network requests (url, status, mime; no request bodies), saves innerText,
# optional screenshot, then closes only its own target and disposes its own context.
# usage: cap.py URL OUTPREFIX [--wait S] [--w W --h H --mobile] [--shot] [--eval JS] [--bodies SUBSTR]
import json, sys, time, base64, argparse, urllib.request
import websocket

ap = argparse.ArgumentParser()
ap.add_argument('url'); ap.add_argument('out')
ap.add_argument('--wait', type=float, default=12)
ap.add_argument('--w', type=int, default=1440); ap.add_argument('--h', type=int, default=900)
ap.add_argument('--mobile', action='store_true'); ap.add_argument('--shot', action='store_true')
ap.add_argument('--full', action='store_true')
ap.add_argument('--eval', default=None)
ap.add_argument('--bodies', default=None, help='save response bodies whose URL contains this substring')
a = ap.parse_args()

ver = json.load(urllib.request.urlopen('http://127.0.0.1:9222/json/version'))
ws = websocket.create_connection(ver['webSocketDebuggerUrl'], timeout=60, suppress_origin=True)
mid = 0
events = []
def call(method, sid=None, **params):
    global mid
    mid += 1; my = mid
    msg = {'id': my, 'method': method, 'params': params}
    if sid: msg['sessionId'] = sid
    ws.send(json.dumps(msg))
    while True:
        m = json.loads(ws.recv())
        if m.get('id') == my:
            if 'error' in m: raise RuntimeError(f"{method}: {m['error']}")
            return m.get('result', {})
        events.append(m)

ctx = call('Target.createBrowserContext', disposeOnDetach=True)['browserContextId']
tid = call('Target.createTarget', url='about:blank', browserContextId=ctx)['targetId']
sid = call('Target.attachToTarget', targetId=tid, flatten=True)['sessionId']
try:
    call('Network.enable', sid)
    call('Page.enable', sid)
    call('Emulation.setDeviceMetricsOverride', sid, width=a.w, height=a.h, deviceScaleFactor=1 if not a.mobile else 2, mobile=a.mobile)
    if a.mobile:
        call('Emulation.setUserAgentOverride', sid, userAgent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36')
        call('Emulation.setTouchEmulationEnabled', sid, enabled=True)
    call('Page.navigate', sid, url=a.url)
    t0 = time.time()
    ws.settimeout(1)
    while time.time() - t0 < a.wait:
        try:
            events.append(json.loads(ws.recv()))
        except websocket.WebSocketTimeoutException:
            pass
    ws.settimeout(60)
    reqs = {}
    for e in events:
        if e.get('sessionId') != sid: continue
        p = e.get('params', {})
        if e.get('method') == 'Network.requestWillBeSent':
            reqs.setdefault(p['requestId'], {})['url'] = p['request']['url']; reqs[p['requestId']]['method'] = p['request']['method']
        elif e.get('method') == 'Network.responseReceived':
            r = reqs.setdefault(p['requestId'], {}); r['status'] = p['response']['status']; r['mime'] = p['response'].get('mimeType'); r['type'] = p.get('type')
        elif e.get('method') == 'Network.loadingFailed':
            reqs.setdefault(p['requestId'], {})['failed'] = p.get('errorText')
        elif e.get('method') == 'Network.webSocketCreated':
            reqs.setdefault(p['requestId'], {})['url'] = p['url']; reqs[p['requestId']]['type'] = 'WebSocket'
    with open(a.out + '.net.txt', 'w') as f:
        for rid, r in reqs.items():
            f.write(f"{r.get('method','-')} {r.get('status', r.get('failed','?'))} {r.get('type','-')} {r.get('url','')}\n")
    if a.bodies:
        bd = {}
        for rid, r in reqs.items():
            if a.bodies in r.get('url', '') and r.get('status'):
                try:
                    b = call('Network.getResponseBody', sid, requestId=rid)
                    bd[r['url']] = b['body'] if not b.get('base64Encoded') else '(b64)'
                except Exception as ex:
                    bd[r['url']] = f'(error {ex})'
        json.dump(bd, open(a.out + '.bodies.json', 'w'), indent=1)
    info = call('Runtime.evaluate', sid, expression="JSON.stringify({href: location.href, title: document.title, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})", returnByValue=True)['result']['value']
    txt = call('Runtime.evaluate', sid, expression="document.body ? document.body.innerText : ''", returnByValue=True)['result']['value']
    with open(a.out + '.txt', 'w') as f:
        f.write(f"captured {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} url={a.url} viewport={a.w}x{a.h} mobile={a.mobile}\n{info}\n\n{txt}")
    print(info)
    if a.eval:
        v = call('Runtime.evaluate', sid, expression=a.eval, returnByValue=True, awaitPromise=True).get('result', {}).get('value')
        print('EVAL:', json.dumps(v)[:4000])
        with open(a.out + '.eval.json', 'w') as f: json.dump(v, f, indent=1)
    if a.shot:
        sh = call('Page.captureScreenshot', sid, format='png', captureBeyondViewport=a.full)
        open(a.out + '.png', 'wb').write(base64.b64decode(sh['data']))
finally:
    try: call('Target.closeTarget', targetId=tid)
    except Exception: pass
    try: call('Target.disposeBrowserContext', browserContextId=ctx)
    except Exception: pass
    ws.close()
