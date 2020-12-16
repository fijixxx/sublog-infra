import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda'
import * as iam from '@aws-cdk/aws-iam'
import * as s3 from '@aws-cdk/aws-s3'
import * as s3n from '@aws-cdk/aws-s3-notifications'
import { Code, LayerVersion, Runtime } from '@aws-cdk/aws-lambda';
import { NotificationKeyFilter } from '@aws-cdk/aws-s3'

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

    const sublog_upsert_Lambda = new lambda.Function(this, 'sublog-upsert-meta-record', {
      functionName: 'sublog-upsert-meta-record',
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.AssetCode.fromAsset('src/upsert'),
      handler: 'upsert_meta.lambda_handler',
      role: executionLambdaRole,
      layers: [sublogLambdaLayer]
    });

    const sublog_delete_Lambda = new lambda.Function(this, 'sublog-delete-meta-record', {
      functionName: 'sublog-delete-meta-record',
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.AssetCode.fromAsset('src/delete'),
      handler: 'delete_meta.lambda_handler',
      role: executionLambdaRole,
      layers: [sublogLambdaLayer]
    });


    const assetsBucket = new s3.Bucket(this, 'assetsBucket', {
      bucketName: "sublog-assets"
    })

    const metaNotificationFilter: NotificationKeyFilter = { prefix: 'meta/' }

    assetsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(sublog_upsert_Lambda), metaNotificationFilter
    )

    assetsBucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED, new s3n.LambdaDestination(sublog_delete_Lambda), metaNotificationFilter
    )
  }
}

const app = new cdk.App();
new SublogInfraStack(app, 'sublogInfra');
app.synth();