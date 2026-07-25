# Memento AI Gateway Smoke Test

这个示例演示正确的调用链：

```text
Memento -> Memento AI Gateway -> code.tczor.cn Responses API
```

Memento 只持有 Gateway Token。供应商 Key 只存在于 Gateway 环境变量。

## 模拟模式

终端一：

```bash
MEMENTO_GATEWAY_TOKEN=local-test-token \
MOCK_PROVIDER=1 \
npm run ai:gateway:smoke
```

终端二：

```bash
MEMENTO_GATEWAY_TOKEN=local-test-token \
npm run ai:gateway:client
```

## 真实供应商模式

先撤销已经暴露的旧 Key，并生成新 Key。然后在 Gateway 进程所在终端输入：

```zsh
read -s "TCZOR_API_KEY?请输入新供应商 Key: "
echo
export TCZOR_API_KEY
export MEMENTO_GATEWAY_TOKEN="$(openssl rand -hex 32)"
echo "请把下面的 Gateway Token 配置到测试客户端："
echo "$MEMENTO_GATEWAY_TOKEN"
npm run ai:gateway:smoke
```

在另一个终端设置同一个 Gateway Token：

```zsh
read -s "MEMENTO_GATEWAY_TOKEN?请输入 Gateway Token: "
echo
export MEMENTO_GATEWAY_TOKEN
npm run ai:gateway:client
```

可选变量：

```text
TCZOR_BASE_URL=https://code.tczor.cn
TCZOR_MODEL=gpt-5.5
MEMENTO_GATEWAY_HOST=127.0.0.1
MEMENTO_GATEWAY_PORT=8787
```

如果供应商要求 `/v1/responses`，将 `TCZOR_BASE_URL` 设置为 `https://code.tczor.cn/v1`。

## 生产环境差异

该示例只用于验证协议，不是生产 Gateway。生产版本还必须增加：

- OAuth 登录和短期 Access Token
- 每账号、设备和 IP 限流
- 每日与月度配额
- 输入输出 Token 限制
- Idempotency-Key
- Usage Ledger 和全局成本熔断
- TLS、Secret Manager 和脱敏日志
- JSON Schema 结构化输出与更完整的 Provider 合约测试

不要把 `TCZOR_API_KEY` 放进 Electron、Renderer、客户端配置或开源仓库。
