#!/bin/bash
# usage: gq.sh <host> '<graphql query>'
curl -s -m 60 "https://$1/v1/graphql" -H 'content-type: application/json' -d "$(python3 -I -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$2")"
