#!/usr/bin/env bash
# corpus/lint.sh — health check for the corpus.
#
#   bash corpus/lint.sh            run every check; exit non-zero on failure
#   bash corpus/lint.sh --index    regenerate the catalog block in index.md
#
# Mechanical checks only (frontmatter, link resolution, page size, stale paths,
# orphans). The judgement sweep — contradictions, stale claims, straddling
# pages, vocabulary drift, undefended decisions — is corpus-flow §7 and stays
# human/LLM work.
set -uo pipefail

CORPUS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$CORPUS/.." && pwd)"
MAX_BODY_LINES=200
BEGIN_MARK='<!-- BEGIN GENERATED CATALOG — bash corpus/lint.sh --index -->'
END_MARK='<!-- END GENERATED CATALOG -->'

fail=0   # count of failures, so each check can tell whether *it* failed
err() { printf 'FAIL  %s\n' "$*" >&2; fail=$((fail + 1)); }

# run <label> <fn> — report ok/FAILED for this check alone, remember the failure
run() {
  local label="$1" fn="$2" before="$fail"
  "$fn"
  if [[ "$fail" != "$before" ]]; then
    printf 'FAILED %s\n' "$label" >&2
  else
    printf 'ok     %s\n' "$label"
  fi
}

# --- frontmatter helpers ----------------------------------------------------

# fm_end <file> — line number of the closing `---`, or 0 if no frontmatter.
fm_end() {
  [[ "$(head -1 "$1")" == '---' ]] || { echo 0; return; }
  awk 'NR>1 && /^---[[:space:]]*$/ {print NR; exit}' "$1"
}

# fm_get <file> <key> — value of a frontmatter key, empty if absent.
fm_get() {
  local end; end=$(fm_end "$1"); [[ "$end" -gt 0 ]] || return 0
  sed -n "2,$((end - 1))p" "$1" \
    | sed -n "s/^$2:[[:space:]]*//p" \
    | head -1
}

# --- 1. wiki frontmatter ---------------------------------------------------

check_frontmatter() {
  local f page
  for f in "$CORPUS"/wiki/*.md; do
    [[ -e "$f" ]] || continue
    page="wiki/$(basename "$f")"
    [[ -n "$(fm_get "$f" summary)" ]] || err "$page — missing \`summary:\` frontmatter"
    local upd; upd="$(fm_get "$f" updated)"
    if [[ -z "$upd" ]]; then
      err "$page — missing \`updated:\` frontmatter"
    elif [[ ! "$upd" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
      err "$page — \`updated: $upd\` is not YYYY-MM-DD"
    fi
  done
  for f in "$CORPUS"/todos/*.md; do
    [[ -e "$f" ]] || continue
    page="todos/$(basename "$f")"
    [[ -n "$(fm_get "$f" title)" ]] || err "$page — missing \`title:\` frontmatter"
    [[ -n "$(fm_get "$f" created)" ]] || err "$page — missing \`created:\` frontmatter"
    [[ -n "$(fm_get "$f" status)" ]] || err "$page — missing \`status:\` frontmatter"
  done
}

# --- 2. relative links resolve ---------------------------------------------

corpus_md() {
  find "$CORPUS" -name '*.md' -not -path '*/node_modules/*' | sort
}

# Pages that are frozen historical records: `log.md` is chronological, and a
# brief in done/ or superseded/ is immutable by convention. Their links to code
# rot by design when that code is deleted, and they may not be edited to fix it —
# so linting them for link rot only produces noise nobody can action. Their
# CORPUS-internal links are still checked below; only refs outside corpus/ are
# exempt.
is_frozen() {
  case "$1" in
    */corpus/log.md|*/corpus/briefs/done/*|*/corpus/briefs/superseded/*) return 0 ;;
    *) return 1 ;;
  esac
}

check_links() {
  local f rel dir target n=0
  while IFS= read -r f; do
    rel="${f#"$ROOT"/}"
    dir="$(dirname "$f")"
    while IFS= read -r target; do
      [[ -n "$target" ]] || continue
      case "$target" in
        http*|mailto:*|'#'*|'') continue ;;
      esac
      target="${target%%#*}"          # drop anchor
      target="${target%%\ *}"          # drop optional link title
      [[ -n "$target" ]] || continue
      # A frozen record may point at code that has since been deleted; it cannot
      # be edited to fix that. Still check its links *within* corpus/.
      if is_frozen "$f" && [[ "$target" == ../../../* || "$target" == ../bots/* \
            || "$target" == ../../bots/* || "$target" == ../shared/* ]]; then
        continue
      fi
      n=$((n + 1))
      [[ -e "$dir/$target" ]] || err "$rel — broken link → $target"
    done < <(grep -oE '\]\([^)]+\)' "$f" | sed -E 's/^\]\(//; s/\)$//')
  done < <(corpus_md)
}

# --- 3. page size (body lines, frontmatter excluded) -----------------------

check_size() {
  local f rel total end body
  while IFS= read -r f; do
    rel="${f#"$ROOT"/}"
    case "$rel" in corpus/log.md) continue ;; esac   # log is append-only history
    total=$(wc -l < "$f")
    end=$(fm_end "$f")
    body=$((total - end))
    if (( body > MAX_BODY_LINES )); then
      err "$rel — $body body lines (cap $MAX_BODY_LINES) — split it, one concept per file"
    fi
  done < <(corpus_md)
}

# --- 4. stale repo paths named in backticks -------------------------------

# Conservative on purpose:
#   * only pages that make claims about the CURRENT repo are scanned — `wiki/`
#     and the top-level corpus files, minus `log.md` (a chronological record is
#     SUPPOSED to name paths that have since been deleted). `todos/` and
#     `briefs/` legitimately name paths that don't exist yet.
#   * a line carrying `<!-- stale-ok -->` is skipped, for the case where a page
#     deliberately cites a deleted path to explain history.
#   * only a token whose first segment is a real top-level repo entry is
#     checked, so `commands/index.ts` (a relative shorthand) is skipped while
#     `bots/discord/src/player.ts` is verified.
#   * `...` elisions and `./` `../` prefixes are skipped — those are prose and
#     link-resolution's job respectively.
check_stale_paths() {
  local f rel tok first n=0
  while IFS= read -r f; do
    rel="${f#"$ROOT"/}"
    while IFS= read -r tok; do
      [[ "$tok" == */* ]] || continue
      [[ "$tok" == *...* || "$tok" == .* ]] && continue
      first="${tok%%/*}"
      [[ -n "$first" && -e "$ROOT/$first" ]] || continue
      n=$((n + 1))
      [[ -e "$ROOT/${tok%/}" ]] || err "$rel — stale path \`$tok\` (no longer in the repo)"
    done < <(grep -v 'stale-ok' "$f" | grep -oE '`[A-Za-z0-9._/-]+`' | tr -d '`')
  done < <(find "$CORPUS" -maxdepth 1 -name '*.md' ! -name 'log.md'; find "$CORPUS/wiki" -name '*.md')
}

# --- 5. orphan wiki pages -------------------------------------------------

check_orphans() {
  local f page
  for f in "$CORPUS"/wiki/*.md; do
    [[ -e "$f" ]] || continue
    page="$(basename "$f")"
    grep -qE "\]\((\./)?(wiki/)?$page[)#]" "$CORPUS"/index.md "$CORPUS"/wiki/*.md \
      --exclude="$page" 2>/dev/null \
      || grep -qE "\]\((\./)?(wiki/)?$page[)#]" "$CORPUS"/index.md 2>/dev/null \
      || err "wiki/$page — orphan (no inbound link from index.md or another wiki page)"
  done
}

# --- --index: regenerate the catalog block --------------------------------

regen_index() {
  local index="$CORPUS/index.md" tmp f page summary
  grep -qF "$BEGIN_MARK" "$index" || {
    err "index.md — missing the generated-catalog markers; add them first"
    return 1
  }
  tmp="$(mktemp)"
  awk -v b="$BEGIN_MARK" 'index($0,b){exit} {print}' "$index" >"$tmp"
  {
    printf '%s\n\n' "$BEGIN_MARK"
    for f in "$CORPUS"/wiki/*.md; do
      [[ -e "$f" ]] || continue
      page="$(basename "$f")"
      summary="$(fm_get "$f" summary)"
      [[ -n "$summary" ]] || summary='(no summary — lint failure)'
      printf -- '- [wiki/%s](wiki/%s) — %s\n' "$page" "$page" "$summary"
    done
    printf '\n%s\n' "$END_MARK"
  } >>"$tmp"
  awk -v e="$END_MARK" 'f{print} index($0,e){f=1}' "$index" >>"$tmp"
  mv "$tmp" "$index"
}

# --- main ------------------------------------------------------------------

if [[ "${1:-}" == "--index" ]]; then
  regen_index && printf 'ok     index.md catalog regenerated\n'
  exit $(( fail ? 1 : 0 ))
fi

run 'frontmatter' check_frontmatter
run 'relative links resolve' check_links
run 'page size (<= 200 body lines)' check_size
run 'repo paths named in wiki/' check_stale_paths
run 'no orphan wiki pages' check_orphans

if (( fail )); then
  printf '\ncorpus lint FAILED — %d problem(s)\n' "$fail" >&2
  exit 1
fi
printf '\ncorpus lint clean\n'
exit 0
