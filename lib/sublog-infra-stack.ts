import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda'
import * as iam from '@aws-cdk/aws-iam'
import * as s3 from '@aws-cdk/aws-s3'
import * as s3n from '@aws-cdk/aws-s3-notifications'
import { Code, LayerVersion, Runtime } from '@aws-cdk/aws-lambda';
import { NotificationKeyFilter } from '@aws-cdk/aws-s3'

/**
 * sublog の AWS インフラを AWS CDK で IaC するためのコード。
 * ap-northeast-1 リージョン用
 */
export class SublogInfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * 記事入稿/メタデータ削除 処理用の Lambda に権限を付与するロールを作成するセクション
     */
    const executionLambdaRole = new iam.Role(this, 'sublogLambdaExecutionRole', {
      roleName: 'sublogLambdaExecutionRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
      ]})

    /**
     * 記事入稿/メタデータ削除 処理用の Lambda が依存するパッケージの Layer
     */
    const sublogLambdaLayer = new LayerVersion(this, 'sublogLayer', {
      compatibleRuntimes: [Runtime.PYTHON_3_8],
      code: Code.fromAsset('layer')
    })

    /**
     * 記事入稿用 Lambda セクション
     */
    const sublog_upsert_Lambda = new lambda.Function(this, 'sublog-upsert-meta-record', {
      functionName: 'sublog-upsert-meta-record',
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.AssetCode.fromAsset('src/upsert'),
      handler: 'upsert_meta.lambda_handler',
      role: executionLambdaRole,
      layers: [sublogLambdaLayer]
    });

    /**
     * 記事メタデータ削除用 Lambda セクション
     */
    const sublog_delete_Lambda = new lambda.Function(this, 'sublog-delete-meta-record', {
      functionName: 'sublog-delete-meta-record',
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.AssetCode.fromAsset('src/delete'),
      handler: 'delete_meta.lambda_handler',
      role: executionLambdaRole,
      layers: [sublogLambdaLayer]
    });


    /**
     * 記事入稿データ保管用の S3 バケット作成セクション
     */
    const assetsBucket = new s3.Bucket(this, 'assetsBucket', {
      bucketName: "sublog-assets"
    })

    /**
     * S3 Event Notification の プレフィックス/サフィックス を定義
     */
    const metaNotificationFilter: NotificationKeyFilter = { prefix: 'meta/', suffix: '.toml' }

    /**
     * S3 Event Notification を定義
     */
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