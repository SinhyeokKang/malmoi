# Supported file formats

Check which translation file formats Malmoi can read and write.

## Supported formats {#formats}

The supported formats are JSON catalogs, YAML catalogs, Chrome extension messages, one code dictionary per language, and one code dictionary containing all languages.

| Format | Example path |
| --- | --- |
| JSON catalog | `src/locales/{locale}.json` |
| YAML catalog | `config/locales/{locale}.yml` |
| Chrome extension messages | `_locales/{locale}/messages.json` |
| Code dictionary per language | `src/locales/{locale}.ts` |
| Code dictionary for all languages | `src/i18n/namespaces/*.ts` |

## Preserve file structure {#file-structure}

The surgical writers preserve comments, blank lines, and key order where the format supports it. Regenerating writers preserve the format's deterministic ordering, indentation, escaping, and field shape. Values come from the database; the existing file supplies the structure or representation.
