#!/usr/bin/env bash
# Decides which CI jobs a change needs, for ci.yml's `changes` job. Prints three
# `name=value` lines in $GITHUB_OUTPUT format:
#
#   docs_only=true|false      every changed file is docs (rule below). Always false on a push.
#   deps=true|false           a dependency file changed: any package.json or pnpm-lock.yaml,
#                             pnpm-workspace.yaml, .audit-ci.json or .npmrc.
#   packed_readme=true|false  a package's README.md changed. It ships in the package's
#                             tarball, and `pnpm smoke:install` checks its links.
#
# Docs-only = every changed file is under apps/docs-site/ or docs/, a top-level *.md, or a
# README.md / CHANGELOG.md. Other Markdown is not docs-only: schema artifacts
# (fixtures/schemas/**, lab overlays) are .md.
#
# Usage:
#   scripts/ci-changes.sh pr <base-ref>                 diff origin/<base-ref>...HEAD
#   scripts/ci-changes.sh push <before> <after> [forced] diff <before>..<after>
#   scripts/ci-changes.sh classify                      changed paths on stdin
#
# When it can't tell what changed (no base, an all-zero <before> from a new branch, a force
# push, a commit missing from the clone, a git error, an empty diff), it prints the
# run-everything answer: docs_only=false, deps=true, packed_readme=true. ci.yml's conditions
# also run a job when an output is missing. Self-test: scripts/ci-changes.test.sh.
set -u

DOCS_RE='^(apps/docs-site/|docs/)|^[^/]+\.md$|(^|/)(README|CHANGELOG)\.md$'
DEPS_RE='(^|/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$|^\.audit-ci\.json$'
PACKED_README_RE='^(packages|apps)/[^/]+/README\.md$'

everything() {
  echo "docs_only=false"
  echo "deps=true"
  echo "packed_readme=true"
}

classify() {
  local path any=false docs_only=true deps=false packed_readme=false
  while IFS= read -r path || [ -n "${path}" ]; do
    [ -n "${path}" ] || continue
    any=true
    [[ "${path}" =~ ${DOCS_RE} ]] || docs_only=false
    [[ "${path}" =~ ${DEPS_RE} ]] && deps=true
    [[ "${path}" =~ ${PACKED_README_RE} ]] && packed_readme=true
  done
  if [ "${any}" = false ]; then
    echo "ci-changes: no changed files; running everything" >&2
    everything
    return
  fi
  echo "docs_only=${docs_only}"
  echo "deps=${deps}"
  echo "packed_readme=${packed_readme}"
}

# Prints the classification of `git diff --name-only "$@"`, or everything() if git fails.
classify_diff() {
  local changed
  if ! changed="$(git diff --name-only "$@")"; then
    echo "ci-changes: git diff $* failed; running everything" >&2
    everything
    return
  fi
  printf '%s\n' "${changed}" | classify
}

mode="${1:-}"
case "${mode}" in
  classify)
    classify
    ;;
  pr)
    base_ref="${2:-}"
    if [ -z "${base_ref}" ]; then
      echo "ci-changes: no base ref; running everything" >&2
      everything
      exit 0
    fi
    classify_diff "origin/${base_ref}...HEAD"
    ;;
  push)
    before="${2:-}" after="${3:-}" forced="${4:-false}"
    if [ -z "${before}" ] || [ -z "${after}" ] || [[ "${before}" =~ ^0+$ ]]; then
      echo "ci-changes: no previous commit to diff against; running everything" >&2
      everything
    elif [ "${forced}" = true ]; then
      echo "ci-changes: force push; running everything" >&2
      everything
    elif ! git merge-base --is-ancestor "${before}" "${after}" 2>/dev/null; then
      echo "ci-changes: ${before} is missing or not an ancestor of ${after}; running everything" >&2
      everything
    else
      # Nothing is skipped on a push: only docs_only changes, and only to false.
      classify_diff "${before}..${after}" | sed 's/^docs_only=.*/docs_only=false/'
    fi
    ;;
  *)
    echo "ci-changes: unknown mode '${mode}'; running everything" >&2
    everything
    ;;
esac
exit 0
