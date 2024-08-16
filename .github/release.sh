#!/bin/bash
set -e

RELEASE_TAG_WITHOUT_PREFIX=$(cat package.json | jq -r '.version')

echo "Publishing release $RELEASE_TAG_WITHOUT_PREFIX"

yarn hardhat soko push --release "v$RELEASE_TAG_WITHOUT_PREFIX" && echo "Successfully pushed release artifact" || echo "Failed to push release, we assume here that this is because the release already exists. We need to improve this!"

echo "Downloading release artifacts"

yarn hardhat soko pull

echo "Release artifacts downloaded"

echo "Preparing NPM package"

yarn release:build-exposed-abis

yarn release:build-deployments-summary

echo "Publishing NPM package"

yarn changeset publish
