#!/usr/bin/env bash
# ============================================================
# PMTool · 发布密钥守卫（本地可跑，CI 也调用本脚本）
#
# 目标：公钥入库、私钥不出本机、CI 零 secret。
#   1. 扫描 git 会提交的内容，命中私钥头 / 私钥 hex 字段 / 备份串 → 失败
#   2. 校验 app/src-tauri/keys/product_keys.json（存在、可解析、keys 非空、64 位 hex）
#   3. 扫描 .github/workflows/*.yml，禁止 secrets. 与私钥环境变量同行
#
# 说明：只扫描「会被提交的内容」（tracked + 未被 .gitignore 忽略的 untracked）。
# 本机已被 .gitignore 排除的私钥文件不属于泄漏面，也不会进入 CI。
# 测试夹具里的假 key 可通过 scripts/keyguard-allowlist.txt 放行（一行一个路径）。
# ============================================================
set -u

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR" || exit 2

ALLOWLIST="scripts/keyguard-allowlist.txt"
KEYS_FILE="app/src-tauri/keys/product_keys.json"

# 检测模式拆开拼接，避免脚本自身被扫描时命中（本脚本必须入库）
PRIVATE_KEY_RE='BEGIN [A-Z ]*PRIV'"ATE KEY"
PRIVATE_HEX_RE='"private''_hex"[[:space:]]*:[[:space:]]*"?[0-9a-fA-F]{64}'
BACKUP_BLOB_RE='LCBK''1:'
SECRET_ENV_RE='secrets\.'
PRIVATE_ENV_RE='PRIVATE_KEY'

SCAN_LIST="$(mktemp "${TMPDIR:-/tmp}/keyguard.XXXXXX")"
trap 'rm -f "$SCAN_LIST"' EXIT INT TERM

fail=0

is_allowlisted() {
    local target="$1"
    local line
    [ -f "$ALLOWLIST" ] || return 1
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%%#*}"
        line="$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
        [ -n "$line" ] || continue
        line="${line#./}"
        [ "$line" = "$target" ] && return 0
    done < "$ALLOWLIST"
    return 1
}

report_hits() {
    local file="$1"
    local hits="$2"
    local hit
    while IFS= read -r hit; do
        printf '❌ 疑似私钥/备份串：%s:%s\n' "$file" "$hit"
    done <<< "$hits"
}

# ---------- 1. 私钥 / 备份串扫描 ----------
{
    git ls-files
    git ls-files --others --exclude-standard
} | sort -u > "$SCAN_LIST"

while IFS= read -r file; do
    [ -n "$file" ] || continue
    [ -f "$file" ] || continue
    is_allowlisted "$file" && continue

    hits="$(grep -nI -E "$PRIVATE_KEY_RE|$PRIVATE_HEX_RE|$BACKUP_BLOB_RE" -- "$file" 2>/dev/null || true)"
    if [ -n "$hits" ]; then
        report_hits "$file" "$hits"
        fail=1
    fi
done < "$SCAN_LIST"

# ---------- 2. 公钥清单完整性 ----------
validate_keys_json() {
    if [ ! -f "$KEYS_FILE" ]; then
        printf '❌ 公钥清单缺失：%s\n' "$KEYS_FILE"
        return 1
    fi

    python3 - "$KEYS_FILE" <<'PY'
import json
import re
import sys

path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as fh:
        doc = json.load(fh)
except Exception as exc:  # noqa: BLE001 - 本地守卫脚本，报错即失败
    print(f"❌ 公钥清单无法解析：{path}: {exc}")
    sys.exit(1)

keys = doc.get("keys")
if not isinstance(keys, list) or not keys:
    print(f"❌ 公钥清单 keys 为空：{path}")
    sys.exit(1)

bad = 0
for index, entry in enumerate(keys):
    if not isinstance(entry, dict):
        print(f"❌ 公钥清单 keys[{index}] 不是对象：{path}")
        bad += 1
        continue

    kid = entry.get("kid")
    public_hex = entry.get("public_hex")
    if not isinstance(kid, str) or not kid.strip():
        print(f"❌ 公钥清单 keys[{index}].kid 缺失：{path}")
        bad += 1
    if not isinstance(public_hex, str) or not re.fullmatch(r"[0-9a-f]{64}", public_hex):
        print(f"❌ 公钥清单 keys[{index}].public_hex 不是 64 位小写 hex：{path}")
        bad += 1

if bad:
    sys.exit(1)

print(f"✅ 公钥清单校验通过：{len(keys)} 把公钥")
PY
}

if ! validate_keys_json; then
    fail=1
fi

# ---------- 3. 禁止 CI 注入私钥 secret ----------
for wf in .github/workflows/*.yml .github/workflows/*.yaml; do
    [ -f "$wf" ] || continue
    hits="$(grep -nE "${SECRET_ENV_RE}.*${PRIVATE_ENV_RE}|${PRIVATE_ENV_RE}.*${SECRET_ENV_RE}" -- "$wf" 2>/dev/null || true)"
    if [ -n "$hits" ]; then
        report_hits "$wf" "$hits"
        fail=1
    fi
done

if [ "$fail" -ne 0 ]; then
    printf '❌ 密钥守卫未通过：请移除私钥/备份串，或修正公钥清单后再提交。\n'
    exit 1
fi

printf '✅ 密钥守卫通过：未发现私钥泄露，公钥清单合法，CI 未注入私钥 secret。\n'
exit 0
