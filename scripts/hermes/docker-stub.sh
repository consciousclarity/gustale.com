#!/usr/bin/env bash
# The docker stub used by the build-web-live.sh tests.
#
# WHY IT EXISTS
# -------------
# build-web-live.sh builds the web images and then PROVES their
# provenance: it reads the finished image's .build-sha out of the
# image's own filesystem and refuses to push or deploy if that commit
# is not the one it built.
#
# So a docker stub that only records the `-t` tags is not enough: the
# script asks the stub to READ the image, and a stub that answers
# nothing makes the real script refuse to proceed. That refusal is the
# check working -- but the stub has to model a real image, or the test
# can only ever assert the failure.
#
# WHAT THIS STUB DOES
# -------------------
#   `docker build ... -t <image> --build-arg BUILD_SHA=<sha>`
#       records the image, and remembers the BUILD_SHA it was handed.
#
#   `docker run --rm --entrypoint sh <image> -c 'cat .../.build-sha'`
#       answers with that remembered SHA -- which is exactly what an
#       image built by the Dockerfile carries, because the Dockerfile
#       writes the same ARG into dist/.build-sha.
#
#   anything else
#       succeeds silently.
#
# HOW A TEST MAKES IT LIE
# ------------------------
# Set DOCKER_LIE_SHA to a different commit and every provenance read
# answers with that instead. A test can then assert that the build
# REFUSES an image that claims a commit it does not contain -- which
# is the half of the contract that a permissive stub cannot prove.
#
# USAGE
# -----
#   write_docker_stub <path-to-stub>
#   export DOCKER_BUILT=<file>        # where the -t tags are recorded
#   export DOCKER_BUILT_SHA=<file>    # where "<image>=<sha>" is recorded
#
write_docker_stub() {
  local dest="$1"
  mkdir -p "$(dirname "$dest")"
  cat > "$dest" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "build" ]; then
  prev=""
  for a in "$@"; do
    if [ "$prev" = "-t" ]; then
      echo "$a" >> "$DOCKER_BUILT"
      # Remember the BUILD_SHA this image was built with, so the
      # provenance read below can answer as the real image would.
      sha=""
      pprev=""
      for b in "$@"; do
        if [ "$pprev" = "--build-arg" ]; then
          case "$b" in
            BUILD_SHA=*) sha="${b#BUILD_SHA=}" ;;
          esac
        fi
        pprev="$b"
      done
      echo "$a=$sha" >> "$DOCKER_BUILT_SHA"
    fi
    prev="$a"
  done
  exit 0
fi

# The provenance read. The image is the last non-flag argument before
# the `-c` script.
if [ "${1:-}" = "run" ]; then
  if [ -n "${DOCKER_LIE_SHA:-}" ]; then
    printf '%s' "$DOCKER_LIE_SHA"
    exit 0
  fi
  img=""
  prev=""
  for a in "$@"; do
    if [ "$prev" = "-c" ]; then break; fi
    case "$a" in
      -*) ;;
      run|rm|--entrypoint|sh) ;;
      *) img="$a" ;;
    esac
    prev="$a"
  done
  if [ -n "${DOCKER_BUILT_SHA:-}" ] && [ -f "$DOCKER_BUILT_SHA" ]; then
    line="$(grep -F -- "$img=" "$DOCKER_BUILT_SHA" | tail -1)"
    sha="${line#*=}"
    if [ -n "$sha" ]; then
      printf '%s' "$sha"
      exit 0
    fi
  fi
fi

exit 0
EOF
  chmod +x "$dest"
}
