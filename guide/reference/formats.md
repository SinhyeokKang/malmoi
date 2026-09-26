# Supported file formats

Check which translation file formats Malmoi can read and write.

## Supported formats {#formats}

The supported formats are JSON catalogs, YAML catalogs, Chrome extension messages, one code dictionary per language, and one code dictionary containing all languages. Detection needs at least two languages.

| Format | Example path |
| --- | --- |
| JSON catalog | `src/locales/{locale}.json` |
| YAML catalog | `config/locales/{locale}.yml` |
| Chrome extension messages | `_locales/{locale}/messages.json` |
| Code dictionary (one file per language) | `src/locales/{locale}.ts` |
| Code dictionary (all languages in one file) | `src/i18n/namespaces/*.ts` |

## Preserve file structure {#file-structure}

JSON and YAML catalogs keep comments, blank lines, and key order where the format supports it. Chrome messages and code dictionaries preserve their file representation, including indentation, one-line containers, escapes, and field order. `{locale}` stands for a language name; `*` stands for any matching path segment. Values come from Malmoi; the existing file supplies the structure or representation.
