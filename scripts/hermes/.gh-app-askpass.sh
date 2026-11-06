#!/bin/sh
# GIT_ASKPASS helper for scripts/hermes/push-with-app.py.
#
# Git calls this with the prompt text as $1 and reads the answer from
# stdout. GitHub wants the username "x-access-token" and the
# installation token as the password.
#
# The token comes from the environment, not from this file, so the
# file itself never contains a credential. The file is written 0700
# for the duration of one push and deleted immediately after.
case "$1" in
  *Username*) printf '%s\n' 'x-access-token' ;;
  *) printf '%s\n' "$GITHUB_APP_TOKEN" ;;
esac
