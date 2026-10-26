# Errors

This page documents all error conditions for the WebSocket API, including close codes, connection failures, and application-level error messages.

## WebSocket Close Codes

The server uses standard and application-specific WebSocket close codes:

| Code | Name | Trigger | Client Action |
|------|------|---------|---------------|
| 1000 | Normal Closure | Connection closed gracefully by server | No action needed |
| 1001 | Going Away | Server is shutting down (graceful shutdown) | Reconnect after a delay with backoff |
| 4001 | Slow Consumer | Client's send buffer is full (can't keep up with message rate) | Reconnect and resubscribe for a fresh snapshot |

## Connection-Level Failures

These failures result in a silent close with no WebSocket close frame sent:

| Failure | Trigger | Timeout | Client Observation |
|---------|---------|---------|-------------------|
| Read Timeout | No message received within 60s | 60s | Connection drops; send pings every <30s to prevent |
| Read Error | Underlying TCP/TLS error during read | -- | Connection drops unexpectedly |
| Write Error | TCP/TLS write failure in write loop | -- | Connection drops unexpectedly |
| Upgrade Rejected | Server shutting down during HTTP upgrade | -- | HTTP 503 Service Unavailable |

> [!NOTE]
> To avoid read timeouts, send a `{"operation": "ping"}` heartbeat at least every 30 seconds.

## Protocol Errors

Errors returned by [REST-over-WebSocket operations](operations.md) as JSON messages with `type` set to `"error"`:

```json
{"type": "error", "errorName": "...", "message": "...", "id": 1}
```

The `id` field echoes the request ID when available, allowing clients to correlate errors with specific requests.

| `errorName` | Trigger | Example Message |
|-------------|---------|-----------------|
| `invalid_request` | Unparseable JSON or missing `operation` field | `"invalid JSON request"`, `"missing operation field"` |
| `unknown_operation` | `operation` doesn't match any OpenAPI operationId | `"unknown operation: invalidOp"` |
| `invalid_parameters` | Missing/invalid path or query parameters | `"missing required path parameter: symbol"` |
| `too_many_requests` | Per-connection concurrent request limit exceeded (default 100) | `"too many concurrent requests, try again later"` |
| `internal_error` | Unhandled server-side error during dispatch | `"internal error"` |

### Subscription Errors

Errors from `subscribe` / `unsubscribe` requests. The envelope is flat - there is **no** `channel` field on a subscription error:

```json
{"type": "error", "errorName": "unknown_channel", "message": "..."}
```

| `errorName` | Trigger |
|-------------|---------|
| `unknown_channel` | The `channel` is not a recognized channel name (`orderbook`, `ohlcv`, `trades`, `order`). |
| `subscription_failed` | The channel is valid but params were rejected (missing field, unknown symbol, bad timeframe, malformed `orderId`). |
| `unsubscribe_failed` | An `unsubscribe` request could not be processed. |
| `not_subscribed` | An `unsubscribe` targeted a channel/params combination the connection was not subscribed to. |
