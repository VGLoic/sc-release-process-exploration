#!/bin/bash

RELEASE_TAG_WITHOUT_PREFIX=$(cat package.json | jq -r '.version')

echo "Publishing release $RELEASE_TAG_WITHOUT_PREFIX"

BUILD_INFO_FILE_NAME=$(ls -AU artifacts/build-info | head -1)

echo "Build info file: $BUILD_INFO_FILE_NAME"

aws s3 cp artifacts/build-info/$BUILD_INFO_FILE_NAME s3://$BUCKET_NAME/releases/v$RELEASE_TAG_WITHOUT_PREFIX/build-info.json

echo "Build info file uploaded to S3"

echo "Downloading release artifacts from S3"

mkdir -p releases/

aws s3 cp s3://$BUCKET_NAME/releases/ releases/ --recursive

echo "Release artifacts downloaded"

echo "Preparing NPM package"

yarn generate-releases-summary

yarn release:build-exposed-abis

yarn release:build-deployments-summary

echo "Publishing NPM package"

yarn changeset publish
