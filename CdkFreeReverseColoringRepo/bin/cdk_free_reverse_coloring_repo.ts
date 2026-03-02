#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkFreeReverseColoringRepoStack } from '../lib/cdk_free_reverse_coloring_repo-stack';

const app = new cdk.App();
new CdkFreeReverseColoringRepoStack(app, 'CdkFreeReverseColoringRepoStack', {
  env: { account: '186669525308', region: 'us-east-1' }

});