#!/usr/bin/env bash

set -euo pipefail

API_URL="${TCZOR_API_URL:-https://code.tczor.cn/v1/responses}"
MODEL="${TCZOR_MODEL:-grok-4.5}"
MAX_OUTPUT_TOKENS="${TCZOR_MAX_OUTPUT_TOKENS:-4000}"
API_KEY="${SUB2API_API_KEY:-${TCZOR_API_KEY:-}}"

if [[ -z "$API_KEY" ]]; then
  printf '错误：请先设置 SUB2API_API_KEY 或 TCZOR_API_KEY。\n' >&2
  printf "用法：SUB2API_API_KEY='你的新 Key' %s\n" "$0" >&2
  exit 1
fi

for command_name in curl jq; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf '错误：缺少命令 %s。\n' "$command_name" >&2
    exit 1
  fi
done

if (($# > 0)); then
  PROMPT="$*"
else
  PROMPT='请完整分析以下 macOS 服务：com.cisco.anyconnect.notification、com.oray.sunlogin.desktopagent、com.FT_CZ.tokenservice。逐个说明所属软件、用途、能否停止、停止影响、能否删除、删除风险、需要检查的证据及安全建议。最后输出汇总表，不要只回答一句。信息不确定时必须明确说明，不得编造信息。'
fi

INSTRUCTIONS='你是一名谨慎的 macOS 系统维护分析助手。本次请求不能使用网页搜索、浏览器、终端或任何外部工具。不要说“我将搜索”“稍后继续”或等待工具返回；必须立即仅根据输入和已有知识完成最终回答。无法确认的服务应明确写“不确定”，并列出需要用户在本机补充的 plist 路径、可执行文件路径、ProgramArguments 和代码签名信息。必须逐项完成用户要求并给出汇总表后才能结束。不要提供未经验证的删除命令。'

PAYLOAD="$({
  jq -nc \
    --arg model "$MODEL" \
    --arg instructions "$INSTRUCTIONS" \
    --arg input "$PROMPT" \
    --argjson max_output_tokens "$MAX_OUTPUT_TOKENS" \
    '{
      model: $model,
      stream: true,
      store: false,
      max_output_tokens: $max_output_tokens,
      instructions: $instructions,
      input: $input
    }'
})"

RAW_RESPONSE_FILE="$(mktemp "${TMPDIR:-/tmp}/memento-tczor-stream.XXXXXX")"
TEXT_RESPONSE_FILE="$(mktemp "${TMPDIR:-/tmp}/memento-tczor-text.XXXXXX")"
KEEP_RAW_LOG="${TCZOR_DEBUG:-0}"

cleanup() {
  rm -f "$TEXT_RESPONSE_FILE"
  if [[ "$KEEP_RAW_LOG" != "1" ]]; then
    rm -f "$RAW_RESPONSE_FILE"
  fi
}
trap cleanup EXIT

printf '正在调用 %s（模型：%s）...\n\n' "$API_URL" "$MODEL" >&2

curl --no-buffer \
  --silent \
  --show-error \
  --fail-with-body \
  --connect-timeout 15 \
  --max-time 300 \
  "$API_URL" \
  --header "Authorization: Bearer ${API_KEY}" \
  --header 'Content-Type: application/json' \
  --header 'Accept: text/event-stream' \
  --data-binary "$PAYLOAD" |
tee "$RAW_RESPONSE_FILE" |
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    'data: [DONE]')
      ;;
    'data: '*)
      event_data="${line#data: }"
      event_type="$(printf '%s' "$event_data" | jq -r '.type // empty' 2>/dev/null || true)"

      case "$event_type" in
        response.output_text.delta|output_text.delta)
          printf '%s' "$event_data" |
            jq --unbuffered -jr '.delta // empty' |
            tee -a "$TEXT_RESPONSE_FILE"
          ;;
        response.failed|response.incomplete|error)
          printf '\n\n服务端返回异常事件：\n' >&2
          printf '%s\n' "$event_data" | jq . >&2
          ;;
      esac
      ;;
    ''|'event: '*)
      ;;
    *)
      printf '%s\n' "$line" >&2
      ;;
  esac
done

printf '\n'

TEXT_LENGTH="$(wc -m <"$TEXT_RESPONSE_FILE" | tr -d '[:space:]')"
if [[ -z "$TEXT_LENGTH" ]]; then
  TEXT_LENGTH=0
fi

if ((TEXT_LENGTH < 120)); then
  KEEP_RAW_LOG=1
  printf '\n警告：模型只返回了 %s 个字符，原始 SSE 已保存在：\n%s\n' \
    "$TEXT_LENGTH" "$RAW_RESPONSE_FILE" >&2
  printf '事件统计：\n' >&2
  awk '/^data: / {
    sub(/^data: /, "")
    sub(/\r$/, "")
    if ($0 != "[DONE]") print
  }' "$RAW_RESPONSE_FILE" |
    jq -sr '
      group_by(.type // "unknown")[]
      | "  \(.[0].type // "unknown"): \(length)"
    ' >&2 || true
  printf '最终响应摘要：\n' >&2
  awk '/^data: / {
    sub(/^data: /, "")
    sub(/\r$/, "")
    if ($0 != "[DONE]") print
  }' "$RAW_RESPONSE_FILE" |
    jq -sr '
      [
        .[]
        | select(
            .type == "response.completed"
            or .type == "response.incomplete"
            or .type == "response.failed"
          )
      ]
      | last
      | (.response // {})
      | {
          status,
          incomplete_details,
          error,
          output_types: [.output[]?.type]
        }
    ' >&2 || true
elif [[ "$KEEP_RAW_LOG" == "1" ]]; then
  printf '\n原始 SSE 已保存在：%s\n' "$RAW_RESPONSE_FILE" >&2
fi
