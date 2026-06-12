# GitHub Project Board — issue pulldown

Project **#3**, owner **Talor-A**. Status field name: **Status**.

## List ready issues

```bash
gh project item-list 3 --owner Talor-A \
  --query 'status:"Ready to work on" is:issue is:open' \
  --format json --limit 20 \
  --jq '.items[] | {id, title: .content.title, number: .content.number, url: .content.url}'
```

## Resolve IDs (shell)

```bash
PROJECT_ID=$(gh project view 3 --owner Talor-A --format json --jq .id)

fields_json=$(gh project field-list 3 --owner Talor-A --format json)
STATUS_FIELD_ID=$(echo "$fields_json" | jq -r '.fields[] | select(.name == "Status") | .id')

# List all status options
echo "$fields_json" | jq -r '.fields[] | select(.name == "Status") | .options[] | "\(.name): \(.id)"'

READY_ID=$(echo "$fields_json" | jq -r '.fields[] | select(.name == "Status") | .options[] | select(.name == "Ready to work on") | .id')
WAITING_ID=$(echo "$fields_json" | jq -r '.fields[] | select(.name == "Status") | .options[] | select(.name == "Waiting for human") | .id')
```

## Update item status

```bash
gh project item-edit \
  --id "<PVTI_...>" \
  --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" \
  --single-select-option-id "$WAITING_ID"
```

## Comment + move (reject not-ready issue)

```bash
gh issue comment 42 --repo Talor-A/jiffy --body "…"
gh project item-edit --id "<PVTI_...>" --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" --single-select-option-id "$WAITING_ID"
```
