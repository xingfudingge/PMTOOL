#!/bin/bash

# PMTool 项目一键启停脚本
# 使用方法:
#   ./start.sh start      - 启动 PMTool (Tauri 1420)
#   ./start.sh start-lg   - 启动 License Generator (1421)
#   ./start.sh stop       - 停止 PMTool
#   ./start.sh stop-lg    - 停止 License Generator
#   ./start.sh stop-all   - 停止所有服务
#   ./start.sh restart    - 重启 PMTool
#   ./start.sh status     - 查看运行状态
#   ./start.sh clean      - 清理项目
#   ./start.sh build      - 打包应用 (DMG)

# 加载 Rust 环境变量 (检查多个可能的路径)
if [ -f "/Users/example/AIWorkSpace/env/tools/rust/cargo/env" ]; then
    source "/Users/example/AIWorkSpace/env/tools/rust/cargo/env"
elif [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
elif [ -f "/Users/example/.cargo/env" ]; then
    source "/Users/example/.cargo/env"
fi

export PATH="$HOME/.cargo/bin:$PATH"

# 配置
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$PROJECT_DIR/app"
TAURI_DIR="$PROJECT_DIR/app/src-tauri"
LG_DIR="$PROJECT_DIR/app/license-generator"

# 端口配置
TAURI_PORT=1420
LG_PORT=1421

# PID 文件路径
TAURI_PID_FILE="$PROJECT_DIR/.pmtool-tauri.pid"
LG_PID_FILE="$PROJECT_DIR/.pmtool-lg.pid"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查端口是否被占用
check_port() {
    lsof -i :$1 > /dev/null 2>&1
}

# 获取进程 ID (通过端口)
get_pid_by_port() {
    lsof -ti:$1 2>/dev/null | head -1
}

# 获取进程 ID (通过 PID 文件)
get_pid_from_file() {
    local pid_file=$1
    if [ -f "$pid_file" ]; then
        cat "$pid_file" 2>/dev/null
    fi
}

# 彻底停止指定端口的所有相关进程
force_stop_port() {
    local port=$1
    local pid_file=$2
    local name=$3

    log_info "正在停止 $name (端口 $port)..."

    # 1. 从 PID 文件读取进程
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log_info "终止进程 $pid..."
            kill -9 "$pid" 2>/dev/null || true
            sleep 0.3
        fi
        rm -f "$pid_file"
    fi

    # 2. 查找并杀死该端口的所有进程
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [ -n "$pids" ]; then
        log_info "终止占用端口 $port 的进程..."
        echo "$pids" | xargs -r kill -9 2>/dev/null || true
        sleep 0.3
    fi

    # 3. 查找 node 进程 (npm run dev 子进程)
    local node_pids=$(pgrep -P $(lsof -ti:$port 2>/dev/null | head -1) 2>/dev/null || true)
    if [ -n "$node_pids" ]; then
        echo "$node_pids" | xargs -r kill -9 2>/dev/null || true
        sleep 0.3
    fi

    # 4. 检查是否还有残留
    local remaining=$(lsof -ti:$port 2>/dev/null)
    if [ -n "$remaining" ]; then
        log_error "$port 端口仍有进程占用，强制终止..."
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 0.5
    fi

    # 5. 确认端口已释放
    if check_port $port; then
        log_error "警告：$name 停止后端口 $port 仍被占用"
        return 1
    fi

    log_success "$name 已完全停止"
    return 0
}

# 停止 PMTool (完全停止所有相关进程)
stop_pmtool() {
    # 等待进程完全释放端口
    local max_wait=10
    local waited=0

    while check_port $TAURI_PORT && [ $waited -lt $max_wait ]; do
        log_info "等待端口 $TAURI_PORT 释放..."
        sleep 1
        waited=$((waited + 1))
    done

    # 停止进程
    force_stop_port $TAURI_PORT "$TAURI_PID_FILE" "PMTool"

    # 再次确认
    if check_port $TAURI_PORT; then
        log_error "PMTool 未完全停止"
        return 1
    fi

    return 0
}

# 停止 License Generator
stop_license_generator() {
    force_stop_port $LG_PORT "$LG_PID_FILE" "License Generator"
}

# 停止所有
stop_all() {
    stop_pmtool || true
    stop_license_generator || true
    log_success "所有服务已停止"
}

# 显示状态
show_status() {
    echo ""
    echo "=========================================="
    echo "         PMTool 项目运行状态"
    echo "=========================================="

    if check_port $TAURI_PORT; then
        local pid=$(lsof -ti:$TAURI_PORT 2>/dev/null | head -1)
        echo -e "${GREEN}✓${NC} PMTool       : 运行中 (端口 $TAURI_PORT, PID: $pid)"
    else
        echo -e "${RED}✗${NC} PMTool       : 未启动"
    fi

    if check_port $LG_PORT; then
        local pid=$(lsof -ti:$LG_PORT 2>/dev/null | head -1)
        echo -e "${GREEN}✓${NC} License Gen  : 运行中 (端口 $LG_PORT, PID: $pid)"
    else
        echo -e "${RED}✗${NC} License Gen  : 未启动"
    fi

    echo ""
    echo "=========================================="
}

# 检查是否正在启动中
is_starting() {
    if [ -f "$TAURI_PID_FILE" ]; then
        local pid=$(cat "$TAURI_PID_FILE")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# 启动 PMTool
start_pmtool() {
    log_info "检查端口 $TAURI_PORT..."

    # 检查端口是否被占用
    if check_port $TAURI_PORT; then
        local pid=$(get_pid_by_port $TAURI_PORT)
        log_error "端口 $TAURI_PORT 已被占用 (PID: $pid)"
        log_error "请先执行 ./start.sh stop 停止现有进程"
        return 1
    fi

    log_info "启动 PMTool (前端 Vite + 后端 Tauri/Rust)..."

    cd "$TAURI_DIR/../" || exit 1

    # 检查 node_modules 是否存在
    if [ ! -d "node_modules" ]; then
        log_info "安装依赖中..."
        if command -v pnpm &> /dev/null; then
            pnpm install || { log_error "依赖安装失败"; return 1; }
        else
            npm install || { log_error "依赖安装失败"; return 1; }
        fi
    fi

    # 说明：Tauri 的 beforeDevCommand 会自行启动 Vite(1420)，此处不再手动启动，
    # 避免重复占用同一端口导致冲突。
    log_info "启动 Tauri 后端 (beforeDevCommand 会带起 Vite...)"

    # 后台启动 Tauri (输出到文件)
    if command -v pnpm &> /dev/null; then
        pnpm run tauri:dev > "$PROJECT_DIR/pmtool-tauri.log" 2>&1 &
    else
        npm run tauri:dev > "$PROJECT_DIR/pmtool-tauri.log" 2>&1 &
    fi
    local tauri_pid=$!
    echo $tauri_pid > "$TAURI_PID_FILE"

    log_info "Tauri PID: $tauri_pid"

    # 等待 Tauri 真正启动（首次编译较慢，放宽到 90 秒）
    waited=0
    local tauri_started=false
    local max_wait=90

    while [ "$waited" -lt "$max_wait" ]; do
        # 检查端口是否被占用
        if check_port $TAURI_PORT; then
            # 等待一小会儿让进程完全启动
            sleep 1

            # 检查 Tauri 日志是否显示 running
            if grep -q "Running\|pmtool" "$PROJECT_DIR/pmtool-tauri.log" 2>/dev/null; then
                tauri_started=true
                log_info "Tauri 已启动"
                break
            fi
        fi
        sleep 1
        waited=$((waited + 1))
    done

    if [ "$tauri_started" = false ]; then
        log_error "Tauri 启动超时"
        log_info "请查看日志：tail -50 $PROJECT_DIR/pmtool-tauri.log"
        # 尝试清理
        kill $tauri_pid 2>/dev/null || true
        return 1
    fi

    # 确认端口占用进程确实是我们启动的
    local current_pid=$(get_pid_by_port $TAURI_PORT)
    if [ -n "$current_pid" ]; then
        log_success "PMTool 已启动成功"
        log_success "Tauri 窗口已打开 (端口 $TAURI_PORT)"
        return 0
    fi

    log_warn "启动完成，但端口状态异常"
    return 1
}

# 启动 License Generator
start_license_generator() {
    log_info "检查端口 $LG_PORT..."

    if check_port $LG_PORT; then
        local pid=$(get_pid_by_port $LG_PORT)
        log_error "端口 $LG_PORT 已被占用 (PID: $pid)"
        log_error "请先执行 ./start.sh stop-lg 停止现有进程"
        return 1
    fi

    log_info "启动 License Generator (Tauri 桌面应用)..."

    cd "$LG_DIR" || exit 1

    # 检查 node_modules
    if [ ! -d "node_modules" ]; then
        log_info "安装依赖..."
        npm install || {
            log_error "依赖安装失败"
            return 1
        }
    fi

    # 启动 License Generator (前端服务 + Tauri)
    log_info "启动 License Generator..."
    if command -v pnpm &> /dev/null; then
        pnpm run tauri:dev > "$PROJECT_DIR/lg.log" 2>&1 &
    else
        npm run tauri:dev > "$PROJECT_DIR/lg.log" 2>&1 &
    fi
    local lg_pid=$!
    echo $lg_pid > "$LG_PID_FILE"

    log_info "License Generator PID: $lg_pid"

    # 等待启动
    local max_wait=30
    local waited=0
    local started=false

    while [ $waited -lt $max_wait ]; do
        if check_port $LG_PORT; then
            sleep 1
            started=true
            break
        fi
        sleep 1
        waited=$((waited + 1))
    done

    if [ "$started" = false ]; then
        log_error "License Generator 启动超时"
        log_info "请查看日志：tail -50 $PROJECT_DIR/lg.log"
        return 1
    fi

    log_success "License Generator 已启动成功"
    log_success "窗口已打开 (端口 $LG_PORT)"
    return 0
}

# 打包 (内联自 build-dmg.sh，修正其在 src-tauri 下错跑 npm run 的问题)
build_app() {
    local type=${1:-"all"}
    local do_pmt=false
    local do_lg=false

    case "$type" in
        pmt) do_pmt=true ;;
        lg)  do_lg=true ;;
        all|*)
            do_pmt=true
            do_lg=true
            ;;
    esac

    log_info "=== 打包应用 (${type}) ==="

    # 用 pnpm 优先，回退 npm
    local pkg=pnpm
    command -v pnpm &> /dev/null || pkg=npm

    # 打包 PMTool：tauri:build 定义在 app/package.json，故在 app/ 下执行
    if [ "$do_pmt" = true ]; then
        log_info "=== 打包 PMTool ==="
        cd "$APP_DIR" || return 1
        if [ ! -d "node_modules" ]; then
            log_info "安装前端依赖..."
            "$pkg" install || { log_error "依赖安装失败"; return 1; }
        fi
        "$pkg" run tauri:build || { log_error "PMTool 构建失败"; return 1; }
        log_success "PMTool 构建完成"
    fi

    # 打包 License Generator：tauri:build 定义在 license-generator/package.json
    if [ "$do_lg" = true ]; then
        log_info "=== 打包 License Generator ==="
        cd "$LG_DIR" || return 1
        if [ ! -d "node_modules" ]; then
            log_info "安装前端依赖..."
            "$pkg" install || { log_error "依赖安装失败"; return 1; }
        fi
        "$pkg" run tauri:build || { log_error "License Generator 构建失败"; return 1; }
        log_success "License Generator 构建完成"
    fi

    # 整理 DMG 到 dist/
    log_info "=== 整理输出文件到 dist/ ==="
    mkdir -p "$PROJECT_DIR/dist"
    if [ "$do_pmt" = true ]; then
        local pmt_dmg=$(find "$TAURI_DIR/target/release/bundle" -name "*.dmg" 2>/dev/null | grep -i pmtool | head -1)
        [ -n "$pmt_dmg" ] && cp "$pmt_dmg" "$PROJECT_DIR/dist/" && log_success "PMTool DMG -> dist/$(basename "$pmt_dmg")"
    fi
    if [ "$do_lg" = true ]; then
        local lg_dmg=$(find "$LG_DIR/src-tauri/target/release/bundle" -name "*.dmg" 2>/dev/null | head -1)
        [ -n "$lg_dmg" ] && cp "$lg_dmg" "$PROJECT_DIR/dist/" && log_success "License Generator DMG -> dist/$(basename "$lg_dmg")"
    fi

    log_success "=== 打包完成，产物见 $PROJECT_DIR/dist/ ==="
}

# 清理
clean_project() {
    log_info "=== 清理项目 ==="

    # 先停止所有
    stop_all

    # 删除 node_modules
    if [ -d "$APP_DIR/node_modules" ]; then
        log_info "清理 PMTool 依赖..."
        rm -rf "$APP_DIR/node_modules"
    fi

    if [ -d "$LG_DIR/node_modules" ]; then
        log_info "清理 License Generator 依赖..."
        rm -rf "$LG_DIR/node_modules"
    fi

    # 删除构建产物
    if [ -d "$TAURI_DIR/target" ]; then
        log_info "清理 PMTool 构建产物..."
        rm -rf "$TAURI_DIR/target"
    fi

    if [ -d "$LG_DIR/src-tauri/target" ]; then
        log_info "清理 License Generator 构建产物..."
        rm -rf "$LG_DIR/src-tauri/target"
    fi

    # 删除日志
    rm -f "$PROJECT_DIR"/*.log "$PROJECT_DIR"/.pmtool*.pid 2>/dev/null || true

    log_success "=== 清理完成 ==="
}

# 帮助
show_help() {
    cat << EOF
PMTool 项目一键管理脚本

用法：$0 {start|start-lg|stop|stop-lg|stop-all|restart|status|clean|build|help}

命令:
  start       - 启动 PMTool (Tauri 开发服务器，包含前端 + 后端)
  start-lg    - 启动 License Generator 授权码生成器
  stop        - 停止 PMTool (彻底停止所有进程)
  stop-lg     - 停止 License Generator
  stop-all    - 停止所有服务
  restart     - 重启 PMTool
  status      - 显示运行状态
  clean       - 清理项目 (停止服务 + 删除依赖)
  build [pmt|lg|all] - 打包为 DMG (产物到 dist/)
  help        - 显示帮助

示例:
  $0 start        # 启动 PMTool
  $0 start-lg     # 启动 License Generator
  $0 stop-all     # 停止所有
  $0 build all    # 打包所有应用(默认)
  $0 build pmt    # 只打包 PMTool
  $0 build lg     # 只打包 License Generator
EOF
}

# 主函数
main() {
    local cmd=${1:-"status"}

    case "$cmd" in
        start)
            if check_port $TAURI_PORT; then
                log_warn "端口 $TAURI_PORT 已被占用"
                local pid=$(get_pid_by_port $TAURI_PORT)
                log_error "请先执行 ./start.sh stop 停止现有进程"
                exit 1
            fi
            start_pmtool
            ;;

        start-lg)
            if check_port $LG_PORT; then
                log_warn "端口 $LG_PORT 已被占用"
                local pid=$(get_pid_by_port $LG_PORT)
                log_error "请先执行 ./start.sh stop-lg 停止现有进程"
                exit 1
            fi
            start_license_generator
            ;;

        stop)
            stop_pmtool
            ;;

        stop-lg)
            stop_license_generator
            ;;

        stop-all)
            stop_all
            ;;

        restart)
            stop_pmtool
            sleep 2
            start_pmtool
            ;;

        status)
            show_status
            ;;

        clean)
            clean_project
            ;;

        build)
            build_app "$2"
            ;;

        help|--help|-h)
            show_help
            ;;

        *)
            log_error "未知命令：$cmd"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
