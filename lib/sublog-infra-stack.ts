import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda'
import * as iam from '@aws-cdk/aws-iam'
import * as s3 from '@aws-cdk/aws-s3'
import * as s3n from '@aws-cdk/aws-s3-notifications'
import { Code, LayerVersion, Runtime } from '@aws-cdk/aws-lambda';

export class SublogInfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const executionLambdaRole = new iam.Role(this, 'sublogLambdaExecutionRole', {
      roleName: 'sublogLambdaExecutionRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
      ]})

    const sublogLambdaLayer = new LayerVersion(this, 'sublogLayer', {
      compatibleRuntimes: [Runtime.PYTHON_3_8],
      code: Code.fromAsset('layer')
    })

    const sublogLambda = new lambda.Function(this, 'sublog-create-meta-record', {
      functionName: 'sublog-create-meta-record',
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.AssetCode.fromAsset('src'),
      handler: 'create_meta.lambda_handler',
      role: executionLambdaRole,
      layers: [sublogLambdaLayer]
    });

    const assetsBucket = new s3.Bucket(this, 'assetsBucket', {
      bucketName: "sublog-assets"
    })

    assetsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(sublogLambda)
    )
  }
}

const app = new cdk.App();
new SublogInfraStack(app, 'sublogInfra');
app.synth();