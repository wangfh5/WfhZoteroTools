# Lookup Identifier HTTP Endpoint

`wfh-zotero-tools` registers a local Zotero HTTP endpoint:

- `POST /wfh/lookupIdentifier`

It runs Zotero's in-process "Add Item by Identifier" flow with `Zotero.Translate.Search`, so external tools can hand Zotero a DOI/arXiv/PMID/ISBN and let Zotero do the normal metadata lookup, attachment saving, and library insertion.

## Request

Content type: `application/json`

```json
{
  "identifier": "10.1038/nature12373",
  "collectionKey": "P97STGFC",
  "saveAttachments": true,
  "alsoFindPDF": true,
  "tags": ["fluctuating-hydrodynamics"],
  "note": "<p>Suggested folder: Collection > FH > Theory</p>"
}
```

Fields:

- `identifier` required string. Can contain one identifier or multiple lines of identifiers.
- `collectionKey` optional Zotero collection key. If omitted, items are saved to top-level My Library.
- `saveAttachments` optional boolean, default `true`. Passed through to `translate({ saveAttachments })`.
- `alsoFindPDF` optional boolean, default `false`. After translation, runs `Zotero.Attachments.addAvailableFile()` with methods `["doi", "url", "oa", "custom"]` when the item still has no full-text file.
- `tags` optional string array. Added to each imported parent item as regular tags.
- `note` optional HTML string. Added as a child note under each imported parent item.

## Responses

Success:

- HTTP `201`

```json
{
  "items": [
    {
      "key": "ABCD1234",
      "libraryID": 1,
      "title": "Example title",
      "itemType": "journalArticle",
      "DOI": "10.1038/nature12373",
      "attachments": [
        {
          "key": "EFGH5678",
          "title": "Full Text PDF",
          "contentType": "application/pdf"
        }
      ]
    }
  ]
}
```

Errors:

- HTTP `400` with `{"error":"NO_IDENTIFIERS_FOUND"}`
- HTTP `400` with `{"error":"COLLECTION_NOT_FOUND"}`
- HTTP `404` with `{"error":"NO_RESULTS","identifiers":[...]}`
- HTTP `500` with `{"error":"LOOKUP_IDENTIFIER_FAILED","message":"..."}`

## curl Examples

Single DOI, save to top-level My Library and try a second PDF lookup pass:

```bash
curl -s -X POST http://localhost:23119/wfh/lookupIdentifier \
  -H "Content-Type: application/json" \
  -d '{"identifier":"10.1038/nature12373","alsoFindPDF":true}' | jq .
```

arXiv item into a specific collection with tags and a note:

```bash
curl -s -X POST http://localhost:23119/wfh/lookupIdentifier \
  -H "Content-Type: application/json" \
  -d '{
    "identifier":"arXiv:2301.00234",
    "collectionKey":"P97STGFC",
    "tags":["from-lookup-server"],
    "note":"<p>Imported by wfh-zotero-tools</p>"
  }' | jq .
```

PMID:

```bash
curl -s -X POST http://localhost:23119/wfh/lookupIdentifier \
  -H "Content-Type: application/json" \
  -d '{"identifier":"PMID:36472064"}' | jq .
```

Error case:

```bash
curl -s -X POST http://localhost:23119/wfh/lookupIdentifier \
  -H "Content-Type: application/json" \
  -d '{"identifier":"not-a-doi"}' -w "\nHTTP %{http_code}\n"
```
