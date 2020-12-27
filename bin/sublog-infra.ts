#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { SublogInfraStack } from '../lib/sublog-infra-stack';
import {SublogInfraStackGlobal} from '../lib/sublog-infra-global-stack'

const app = new cdk.App();
new SublogInfraStack(app, 'SublogInfraStack');
new SublogInfraStackGlobal(app, 'sublogInfraGlobal', {env: {region:'us-east-1'}});
