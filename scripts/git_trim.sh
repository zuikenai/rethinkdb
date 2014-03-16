#!/bin/bash

set -eu

old_branches=$(
  comm -23 <(git branch -r | sort) \
           <(git branch -r --contains  'origin/next@{60days}' | sort) \
    | grep -v HEAD | grep origin/ )

merged_branches=$(
  git branch -r --merged origin/next | grep -v HEAD \
    | grep -v HEAD | grep origin/ )

branches=$(
  echo "$old_branches"$'\n'"$merged_branches" | sort -u | egrep -v 'next|v[0-9]' | sed 's|origin/||' )

push_spec=$(
  for branch in $branches; do
    echo origin/$branch:refs/backup/$branch :refs/heads/$branch;
  done )

git push origin -n $push_spec

echo -n "Push these changes? [yn] "
read yes

if [ "$yes" = "y" ]; then
  git push origin $push_spec
fi
