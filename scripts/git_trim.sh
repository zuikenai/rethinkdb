#!/bin/bash

set -eu

git fetch

if [ "${1:-}" = "old" ]; then
    echo 'Listing branches over 60 days old...'
    branches=$(
        comm -23 <(git branch -r | sort) \
            <(git branch -r --contains  'origin/next@{60days}' | sort) \
            | grep -v HEAD | grep origin/ | sort )
elif [ "${1:-}" = "merged" ]; then
    echo 'Listing branches that have been merged into next...'
    branches=$(
        git branch -r --merged origin/next | grep -v HEAD \
            | grep -v HEAD | grep origin/ | sort )
else
    echo "usage: $0 [old|merged]"
    exit
fi

clean_branches=$(
  echo "$branches" | sort -u | egrep -v 'next|v[0-9]' | sed 's|origin/||' )

push_spec=$(
  for branch in $clean_branches; do
    echo +origin/$branch:refs/backup/$branch :refs/heads/$branch;
  done )

git push origin -n $push_spec

echo "$(echo "$push_spec" | wc -l) branches will be backed up and deleted"
echo -n "Push these changes? [yn] "
read yes

if [ "$yes" = "y" ]; then
  git push origin $push_spec
fi
