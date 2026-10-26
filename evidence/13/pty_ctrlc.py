#!/usr/bin/env python3
"""Run a command on a REAL pseudo-terminal and press Ctrl-C once (writes 0x03 to the pty master).

The tty line discipline then sends SIGINT to the terminal's foreground process group, exactly like a
user pressing Ctrl-C in a terminal. Usage (inside the jail):
  pty_ctrlc.py LOG READY_REGEX SETTLE_SECONDS CWD -- cmd args...
Writes LOG (raw terminal output, UTC-stamped lines) and LOG.meta (process tree before the key, key time,
exit status, end time).
"""
import os, pty, re, select, subprocess, sys, time
from datetime import datetime, timezone

def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

log_path, ready_re, settle, cwd = sys.argv[1], re.compile(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
assert sys.argv[5] == "--"
cmd = sys.argv[6:]
meta = open(log_path + ".meta", "w")
meta.write(f"cmd: {' '.join(cmd)}  (cwd {cwd})\nstarted: {now()}\n")
pid, fd = pty.fork()
if pid == 0:
    os.chdir(cwd)
    os.execvp(cmd[0], cmd)
buf = b""
out = open(log_path, "wb")
def pump(timeout):
    global buf
    r, _, _ = select.select([fd], [], [], timeout)
    if not r:
        return "timeout"
    try:
        data = os.read(fd, 65536)
    except OSError:
        return "eof"
    if not data:
        return "eof"
    buf += data
    out.write(data); out.flush()
    return "data"

t0 = time.time()
ready = False
while time.time() - t0 < 120:
    if pump(0.2) == "eof":
        break
    if ready_re.search(buf.decode("utf8", "replace")):
        ready = True
        break
meta.write(f"ready marker seen: {ready} at {now()}\n")
t1 = time.time()
while time.time() - t1 < settle:
    if pump(0.2) == "eof":
        break
tree = subprocess.run(["ps", "-o", "pid,pgid,sid,tpgid,stat,args", "-s", str(pid)], capture_output=True, text=True).stdout
meta.write("process tree (session of the pty child) right before Ctrl-C:\n" + tree)
meta.write(f"Ctrl-C (0x03 written to pty master) at {now()}\n")
os.write(fd, b"\x03")
status = None
t2 = time.time()
while time.time() - t2 < 20:
    alive = pump(0.2) != "eof"
    wpid, st = os.waitpid(pid, os.WNOHANG)
    if wpid == pid:
        status = st
        while pump(0.5) == "data":
            pass
        break
    if not alive:
        wpid, st = os.waitpid(pid, 0)
        status = st
        break
if status is None:
    meta.write("still running 20 s after Ctrl-C -> sending SIGKILL to its session\n")
    os.killpg(pid, 9)
    _, status = os.waitpid(pid, 0)
if os.WIFEXITED(status):
    meta.write(f"pty child (command) exit status: {os.WEXITSTATUS(status)} at {now()}\n")
else:
    meta.write(f"pty child killed by signal {os.WTERMSIG(status)} at {now()}\n")
leftover = subprocess.run(["ps", "-o", "pid,pgid,stat,args", "-s", str(pid)], capture_output=True, text=True).stdout
meta.write("processes left in that session afterwards:\n" + leftover)
meta.close(); out.close()
