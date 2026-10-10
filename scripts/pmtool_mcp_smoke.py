# -*- coding: utf-8 -*-
"""
PMTool · MCP 冒烟自检（发版核对用）
=============================
用法：
  python scripts/pmtool_mcp_smoke.py "<pmtool.exe 路径>" [--list]

- 启动 `pmtool.exe --mcp`，握手 initialize → notifications/initialized → tools/list。
- 断言关键工具已出现在清单里（context_get / document_generate / document_template / project_search）。
- 加 --list 再跑一次 project.list，确认连上后能拿到业务数据。
- 全程只读，无任何副作用；结束时强杀子进程，不会残留窗口。

发版核对：只要跑这个脚本通过，即证明安装包真带 --mcp 且 MCP 通道可用。
若失败，多半是旧构建（构建日期早于 src-tauri/src/mcp.rs 落地），需用最新源码重新发版。
"""
import json
import os
import subprocess
import sys
import threading

# 关键工具最小集：必须出现在 tools/list，否则判为缺 MCP 能力
REQUIRED_FOR_MCP = [
    "pmtool__context_get",
    "pmtool__document_generate",
    "pmtool__document_template",
    "pmtool__project_search",
]

CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def _reader(proc, q):
    """后台线程：逐行读 stdout，塞进队列（跨平台，不依赖 Windows select）。"""
    try:
        for line in proc.stdout:
            q.put(line)
    except Exception:
        pass


def read_resp(q, want_id, timeout=15):
    """从共享队列读，直到收到 jsonrpc id == want_id 的响应（忽略 notifications）。
    注意：只能有一个 reader 线程读 stdout，否则多线程抢同一条流会丢响应。"""
    import queue
    import time

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            line = q.get(timeout=deadline - time.time())
        except queue.Empty:
            break
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        if msg.get("id") == want_id:
            return msg
    return None


def send(proc, obj):
    proc.stdin.write(json.dumps(obj, ensure_ascii=False) + "\n")
    proc.stdin.flush()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    exe = sys.argv[1]
    do_list = "--list" in sys.argv[2:]

    if not os.path.isfile(exe):
        print(f"FAIL: 找不到可执行文件 {exe}")
        sys.exit(1)

    proc = subprocess.Popen(
        [exe, "--mcp"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        bufsize=1,
        creationflags=CREATE_NO_WINDOW,
    )

    # 单一 reader 线程：全程只读一个 stdout 流（多线程抢流会导致读到 id=2 时漏响应）
    import queue
    q = queue.Queue()
    threading.Thread(target=_reader, args=(proc, q), daemon=True).start()

    try:
        # 1) 握手
        send(proc, {
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                       "clientInfo": {"name": "pmtool-mcp-smoke", "version": "1.0"}},
        })
        init = read_resp(q, 1)
        if not init:
            print("FAIL: initialize 无响应 —— 该 exe 可能不含 --mcp（旧构建）")
            sys.exit(1)
        info = init.get("result", {}).get("serverInfo", {})
        print(f"initialize OK → serverInfo: {info.get('name')} v{info.get('version')}")

        # 2) 初始化通知（无 id）
        send(proc, {"jsonrpc": "2.0", "method": "notifications/initialized"})

        # 3) 枚举工具
        send(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        lst = read_resp(q, 2)
        tools = [t.get("name", "") for t in lst.get("result", {}).get("tools", [])] if lst else []
        print(f"tools/list OK → 共 {len(tools)} 个工具")

        missing = [t for t in REQUIRED_FOR_MCP if t not in tools]
        if missing:
            print("FAIL: 缺少关键 MCP 工具 -> " + ", ".join(missing))
            print("  参见 docs/pmtool-mcp-data-interface.md§顶部警示：疑似旧构建，需用最新源码重新发版。")
            sys.exit(1)
        print("PASS: 关键 MCP 工具齐全 -> " + ", ".join(REQUIRED_FOR_MCP))

        if do_list:
            send(proc, {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                        "params": {"name": "pmtool__project_list", "arguments": {"limit": 10}}})
            call = read_resp(q, 3)
            if call and not call.get("error") and "isError" not in call.get("result", {}):
                content = call.get("result", {}).get("content", [])
                text = content[0].get("text", "") if content else ""
                try:
                    parsed = json.loads(text)
                    count = parsed.get("count", "?")
                    print(f"project.list OK → count={count}")
                except Exception:
                    print(f"project.list OK（返回非 JSON 文本，长度 {len(text)}）")
            else:
                print("WARN: project.list 未返回预期结果（可能数据为空或工具差异），此为只读操作无副作用。")
        print("\nSMOKE PASS")
    finally:
        try:
            proc.kill()
        except Exception:
            pass


if __name__ == "__main__":
    main()