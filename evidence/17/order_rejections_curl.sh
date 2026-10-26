# 1) the SDK's query document, as listPerpOrderRejections({ owner }) sends it
curl -s https://hideki-dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' --data '{"query":"query PerpOrderRejections($where: PerpOrderRejection_bool_exp!, $limit: Int, $offset: Int) { _sdkWatermark: chain_metadata { chain_id latest_processed_block } PerpOrderRejection(where: $where, order_by: [{blockNumber: desc}, {id: desc}], limit: $limit, offset: $offset) { id owner pool reason requestIndex timestamp blockNumber txHash } }","variables":{"where":{"owner":{"_eq":"0x440e03bb3aadbe65d5bf2ad7f84a64c509ff438b"}},"limit":50,"offset":0}}'
echo
# 2) the same rows with the two columns the SDK does not select
curl -s https://hideki-dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' --data '{"query":"{ PerpOrderRejection(where: {owner: {_eq: \"0x440e03bb3aadbe65d5bf2ad7f84a64c509ff438b\"}}, order_by: [{blockNumber: desc}, {id: desc}]) { id reason requestIndex blockNumber isAmend oldOrderId } }"}'
echo
# 3) what each tx called and what it logged
for H in 0xd4ca61aada9f748782097974553b72cf00c5a83624c2a6e3510c8ca8d8382bab 0xa1b322ee5a1c8883e08ec196bfa49bc3e06857cf8444d72b5ab83f9d206a887c 0xacc5d5e968716e67d5359d71fde00d7b67bef6022a711ae187909859023bb128; do
  RPC=https://api.hideki2.infra.testnet.somnia.network
  SEL=$(curl -s $RPC -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getTransactionByHash\",\"params\":[\"$H\"]}" | jq -r '.result.input[0:10]')
  curl -s $RPC -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getTransactionReceipt\",\"params\":[\"$H\"]}" | jq -c --arg sel "$SEL" '{tx: .result.transactionHash[0:10], blockHex: .result.blockNumber, selector: $sel, logs: [.result.logs[] | {logIndex, topic0: .topics[0][0:10]}]}'
done
# 4) owner 0xdba45e: the newest 50 rows (SDK default limit) by isAmend, and its isAmend=false rows
curl -s https://hideki-dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' --data '{"query":"{ a: PerpOrderRejection(where: {owner: {_eq: \"0xdba45e5480fc0f365d36e79a2e9eacdb98ac44f9\"}}, order_by: [{blockNumber: desc}, {id: desc}], limit: 50) { isAmend } b: PerpOrderRejection(where: {owner: {_eq: \"0xdba45e5480fc0f365d36e79a2e9eacdb98ac44f9\"}, isAmend: {_eq: false}}) { id } }"}' | jq -c '{newest50_by_isAmend: (.data.a | group_by(.isAmend) | map({isAmend: .[0].isAmend, rows: length})), isAmend_false_rows: (.data.b | length)}'
