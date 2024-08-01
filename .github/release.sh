#!/bin/bash
set -e

RELEASE_TAG_WITHOUT_PREFIX=$(cat package.json | jq -r '.version')

echo "Publishing release $RELEASE_TAG_WITHOUT_PREFIX"

yarn cli push "$RELEASE_TAG_WITHOUT_PREFIX" && echo "Successfully pushed release artifact" || echo "Failed to push release, we assume here that this is because the release already exists. We need to improve this!"

echo "Downloading release artifacts"

yarn cli pull

echo "Release artifacts downloaded"

echo "Preparing NPM package"

yarn cli generate-typings

yarn release:build-exposed-abis

yarn release:build-deployments-summary

echo "Publishing NPM package"

yarn changeset publish
